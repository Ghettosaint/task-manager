import { supabase } from '../../../../lib/supabase'
import { Resend } from 'resend'
import { Vonage } from '@vonage/server-sdk'

// Initialize services
const resend = new Resend(process.env.RESEND_API_KEY)
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
      reminder_times: [1440, 60] // 24 hours and 1 hour before
    }

    if (!notificationSettings.email && !notificationSettings.phone) {
      return Response.json({ error: 'No contact information configured' }, { status: 400 })
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
      let notificationType = ''
      
      if (sendNow || testMode) {
        shouldSendNotification = true
        notificationType = 'test'
      } else {
        // Check each reminder time
        for (const reminderMinutes of notificationSettings.reminder_times) {
          // Check if we haven't already sent this reminder
          const lastNotificationKey = `last_notification_${task.id}_${reminderMinutes}`
          const lastNotificationTime = task[lastNotificationKey]
          
          // Window for sending notifications (5 minutes before and after the exact time)
          const reminderWindowStart = reminderMinutes - 5
          const reminderWindowEnd = reminderMinutes + 5
          
          if (minutesUntilDue >= reminderWindowStart && minutesUntilDue <= reminderWindowEnd) {
            // Check if we haven't sent this notification recently (within last hour)
            if (!lastNotificationTime || new Date(lastNotificationTime) < new Date(now.getTime() - 60 * 60 * 1000)) {
              shouldSendNotification = true
              notificationType = reminderMinutes === 0 ? 'due' : `${reminderMinutes}min`
              
              // Update the last notification time
              await supabase
                .from('tasks')
                .update({ [lastNotificationKey]: now.toISOString() })
                .eq('id', task.id)
              
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
                       `in ${Math.round(hoursUntilDue / 1440)} days`
        
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
                  </div>
                  <p style="color: #64748b; font-size: 14px;">
                    Don't forget to complete this task!
                  </p>
                </div>
              `,
              text: `Task Reminder: ${task.title}\n\n${task.description || ''}\n\nDue: ${dueText}`
            })
            console.log(`Email sent for task: ${task.title} (${notificationType})`)
          } catch (emailError) {
            console.error('Email error:', emailError.message)
          }
        }

        // Send SMS notification
        if (notificationSettings.sms_notifications && notificationSettings.phone) {
          try {
            const smsResult = await vonage.sms.send({
              to: notificationSettings.phone.replace(/[^\d+]/g, ''),
              from: process.env.VONAGE_FROM_NUMBER || 'TaskApp',
              text: `📋 Task Reminder: "${task.title}" is due ${dueText}. Don't forget to complete it!`
            })
            console.log(`SMS sent for task: ${task.title} (${notificationType})`)
          } catch (smsError) {
            console.error('SMS error:', smsError.message)
          }
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
