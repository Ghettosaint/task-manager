import { supabase } from '../../../../lib/supabase'
import { Resend } from 'resend'
import { Vonage } from '@vonage/server-sdk'

// Initialize services
const resend = new Resend(process.env.RESEND_API_KEY)

// Initialize Vonage properly
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
})

export async function POST(request) {
  try {
    const body = await request.json()
    const { testMode = false, settings, sendNow = false } = body

    // Get notification settings with defaults
    let notificationSettings = settings || {
      email: process.env.DEFAULT_EMAIL || '',
      phone: process.env.DEFAULT_PHONE || '',
      email_notifications: true,
      sms_notifications: true,
      reminder_times: [1440, 60, 0] // 24 hours, 1 hour, and at due time
    }

    if (!notificationSettings.email && !notificationSettings.phone) {
      return Response.json({ error: 'No contact information configured' }, { status: 400 })
    }

    // First, handle recurring tasks - create new instances if needed
    if (!testMode) {
      await handleRecurringTasks()
    }

    // Get all pending tasks with due dates
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'pending')
      .not('due_date', 'is', null)

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError)
      return Response.json({ error: 'Failed to fetch tasks' }, { status: 500 })
    }

    let notificationsSent = 0
    const now = new Date()
    
    console.log(`Checking ${tasks.length} pending tasks at ${now.toISOString()}`)

    // Check each task for notification triggers
    for (const task of tasks) {
      const dueDate = new Date(task.due_date)
      const minutesUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60)
      
      console.log(`Task: ${task.title}, Due: ${dueDate.toISOString()}, Minutes until due: ${minutesUntilDue}`)
      
      // Check which notification should be sent
      let shouldSendNotification = false
      let reminderMinutes = null
      
      if (sendNow || testMode) {
        shouldSendNotification = true
        // Find the most appropriate reminder time for test
        reminderMinutes = notificationSettings.reminder_times.find(mins => 
          minutesUntilDue >= mins - 5
        ) || 0
      } else {
        // Check each reminder time
        for (const mins of notificationSettings.reminder_times) {
          // Window for sending notifications (15 minutes window)
          const reminderWindowStart = mins - 15
          const reminderWindowEnd = mins + 15
          
          if (minutesUntilDue >= reminderWindowStart && minutesUntilDue <= reminderWindowEnd) {
            // Check if we've already sent this notification
            const { data: existingNotification } = await supabase
              .from('task_notifications')
              .select('id')
              .eq('task_id', task.id)
              .eq('reminder_minutes', mins)
              .single()
            
            if (!existingNotification) {
              shouldSendNotification = true
              reminderMinutes = mins
              break
            }
          }
        }
      }
      
      if (shouldSendNotification) {
        const hoursUntilDue = Math.round(minutesUntilDue / 60)
        const dueText = minutesUntilDue <= 0 ? 'overdue' : 
                       minutesUntilDue < 60 ? `in ${Math.round(minutesUntilDue)} minutes` :
                       hoursUntilDue < 24 ? `in ${hoursUntilDue} hours` :
                       `in ${Math.round(minutesUntilDue / 1440)} days`
        
        let notificationTypes = []
        
        // Send email notification
        if (notificationSettings.email_notifications && notificationSettings.email) {
          try {
            const emailResult = await resend.emails.send({
              from: 'TaskApp <noreply@resend.dev>',
              to: [notificationSettings.email],
              subject: `Task Reminder: ${task.title}`,
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                  <h2 style="color: #2563eb;">📋 Task Reminder</h2>
                  <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <h3 style="margin: 0; color: #1e293b;">${task.title}</h3>
                    <p style="margin: 10px 0; color: #64748b;">
                      ${task.description || 'No description provided'}
                    </p>
                    <p style="margin: 0; font-weight: bold; color: ${minutesUntilDue <= 0 ? '#dc2626' : '#2563eb'};">
                      Due: ${dueText}
                    </p>
                    ${task.is_recurring ? `<p style="margin: 5px 0; color: #7c3aed; font-size: 14px;">🔄 This is a recurring task</p>` : ''}
                  </div>
                  <p style="color: #64748b; font-size: 14px;">
                    Don't forget to complete this task!
                  </p>
                </div>
              `,
              text: `Task Reminder: ${task.title}\n\n${task.description || ''}\n\nDue: ${dueText}${task.is_recurring ? '\n\n🔄 This is a recurring task' : ''}`
            })
            notificationTypes.push('email')
            console.log(`Email sent for task: ${task.title}`)
          } catch (emailError) {
            console.error('Email error:', emailError.message)
          }
        }

        // Send SMS notification - Improved implementation
        if (notificationSettings.sms_notifications && notificationSettings.phone) {
          try {
            // Clean and format the phone number
            let cleanPhone = notificationSettings.phone.replace(/[^\d+]/g, '')
            
            // Handle different phone number formats
            if (!cleanPhone.startsWith('+')) {
              // If no country code, assume it's a US number if it's 10 digits
              if (cleanPhone.length === 10) {
                cleanPhone = '+1' + cleanPhone
              } else {
                // Otherwise, add + prefix
                cleanPhone = '+' + cleanPhone
              }
            }
            
            console.log(`Attempting to send SMS to: ${cleanPhone}`)
            
            const smsText = `📋 Task Reminder: "${task.title}" is due ${dueText}. ${task.is_recurring ? '🔄 Recurring task. ' : ''}Don't forget to complete it!`
            
            // Use the correct Vonage SMS send method
            const smsResult = await vonage.sms.send({
              to: cleanPhone,
              from: process.env.VONAGE_FROM_NUMBER || 'TaskApp',
              text: smsText
            })
            
            console.log('SMS result:', smsResult)
            
            // Check if SMS was sent successfully
            if (smsResult && smsResult.messages && smsResult.messages[0]) {
              const message = smsResult.messages[0]
              if (message.status === '0') { // Status 0 means success
                notificationTypes.push('sms')
                console.log(`SMS sent successfully for task: ${task.title}`)
              } else {
                console.error(`SMS failed with status ${message.status}: ${message['error-text']}`)
              }
            }
          } catch (smsError) {
            console.error('SMS error details:', smsError)
            console.error('SMS error message:', smsError.message)
            // Continue with other notifications even if SMS fails
          }
        }

        // Record that we sent this notification (unless in test mode)
        if (!testMode && notificationTypes.length > 0 && reminderMinutes !== null) {
          await supabase
            .from('task_notifications')
            .upsert({
              task_id: task.id,
              reminder_minutes: reminderMinutes,
              notification_type: notificationTypes.join(',')
            }, {
              onConflict: 'task_id,reminder_minutes'
            })
        }

        notificationsSent++
      }
    }

    return Response.json({ 
      success: true, 
      tasksChecked: tasks.length,
      notificationsSent,
      message: testMode ? 
        `Test completed - ${notificationsSent} notifications sent` : 
        `Checked ${tasks.length} tasks, sent ${notificationsSent} notifications`
    })

  } catch (error) {
    console.error('Notification error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}

// Handle recurring tasks - create new instances automatically
async function handleRecurringTasks() {
  try {
    console.log('Checking for recurring tasks that need new instances...')
    
    // Get all completed recurring tasks that have a next_due_date
    const { data: completedRecurringTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'completed')
      .eq('is_recurring', true)
      .not('next_due_date', 'is', null)

    // Also get pending recurring tasks that might need next instances created
    const { data: pendingRecurringTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'pending')
      .eq('is_recurring', true)
      .not('next_due_date', 'is', null)

    const allRecurringTasks = [...(completedRecurringTasks || []), ...(pendingRecurringTasks || [])]
    const now = new Date()
    
    console.log(`Found ${allRecurringTasks.length} recurring tasks to check`)
    
    for (const task of allRecurringTasks) {
      const nextDueDate = new Date(task.next_due_date)
      
      // If the next due date has arrived or passed, create the next instance
      if (nextDueDate <= now) {
        console.log(`Next due date reached for task: ${task.title}, creating next instance`)
        
        // Check if we already created a task for this next due date
        const { data: existingNextTask } = await supabase
          .from('tasks')
          .select('id')
          .eq('parent_task_id', task.parent_task_id || task.id)
          .eq('due_date', task.next_due_date)
          .single()

        if (!existingNextTask) {
          // Create the next recurring task instance
          await createNextRecurringTask(task)
        } else {
          console.log(`Task instance already exists for ${task.title}`)
        }
      }
    }

  } catch (error) {
    console.error('Error handling recurring tasks:', error)
  }
}

function calculateNextDueDate(currentDue, type, interval, days) {
  const nextDue = new Date(currentDue)
  
  switch (type) {
    case 'daily':
      nextDue.setDate(nextDue.getDate() + interval)
      break
    case 'weekly':
      nextDue.setDate(nextDue.getDate() + (interval * 7))
      break
    case 'monthly':
      nextDue.setMonth(nextDue.getMonth() + interval)
      break
    case 'yearly':
      nextDue.setFullYear(nextDue.getFullYear() + interval)
      break
    case 'custom':
      if (days && days.length > 0) {
        // Find next occurrence of the specified days
        let foundNext = false
        let daysChecked = 0
        while (!foundNext && daysChecked < 14) { // Check up to 2 weeks ahead
          nextDue.setDate(nextDue.getDate() + 1)
          const dayName = nextDue.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
          if (days.includes(dayName)) {
            foundNext = true
          }
          daysChecked++
        }
      } else {
        // If no custom days specified, default to daily
        nextDue.setDate(nextDue.getDate() + interval)
      }
      break
    default:
      // Default fallback
      nextDue.setDate(nextDue.getDate() + interval)
      break
  }
  
  return nextDue.toISOString()
}

async function createNextRecurringTask(originalTask) {
  try {
    console.log(`Creating next instance for recurring task: ${originalTask.title}`)
    
    const recurrenceDays = originalTask.recurrence_days ? JSON.parse(originalTask.recurrence_days) : []
    
    const nextTaskData = {
      title: originalTask.title,
      description: originalTask.description,
      status: 'pending',
      priority: originalTask.priority,
      notifications_enabled: originalTask.notifications_enabled,
      is_recurring: true,
      recurrence_type: originalTask.recurrence_type,
      recurrence_interval: originalTask.recurrence_interval,
      recurrence_days: originalTask.recurrence_days,
      recurrence_end_date: originalTask.recurrence_end_date,
      parent_task_id: originalTask.parent_task_id || originalTask.id,
      due_date: originalTask.next_due_date
    }

    // Calculate the next due date after this one
    nextTaskData.next_due_date = calculateNextDueDate(
      new Date(originalTask.next_due_date), 
      originalTask.recurrence_type, 
      originalTask.recurrence_interval, 
      recurrenceDays
    )

    // Check if we haven't passed the end date
    if (originalTask.recurrence_end_date) {
      const endDate = new Date(originalTask.recurrence_end_date)
      const nextDue = new Date(nextTaskData.due_date)
      if (nextDue > endDate) {
        console.log('Recurring task has reached its end date')
        return
      }
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert([nextTaskData])
      .select()

    if (error) {
      console.error('Error creating next recurring task:', error)
    } else {
      console.log(`Successfully created next instance for: ${originalTask.title}`, data)
    }
  } catch (error) {
    console.error('Error in createNextRecurringTask:', error)
  }
}

// This will be called by Vercel Cron
export async function GET() {
  console.log('Cron job triggered at:', new Date().toISOString())
  
  // Load settings from your default environment variables
  const settings = {
    email: process.env.DEFAULT_EMAIL || '',
    phone: process.env.DEFAULT_PHONE || '',
    email_notifications: true,
    sms_notifications: true,
    reminder_times: [1440, 60, 0] // 24 hours, 1 hour, and at due time
  }
  
  return POST(new Request('', { 
    method: 'POST', 
    body: JSON.stringify({ 
      testMode: false,
      settings: settings 
    }) 
  }))
}
