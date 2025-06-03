import { supabase } from '../../../lib/supabase'
import { Resend } from 'resend'
import { Vonage } from '@vonage/server-sdk'

const resend = new Resend(process.env.RESEND_API_KEY)

const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
})

export async function POST(request) {
  try {
    const body = await request.json()
    const { testMode = false, settings } = body

    // Get notification settings
    let notificationSettings = settings
    
    // If no settings provided, use defaults (you can hardcode your info here)
    if (!notificationSettings) {
      notificationSettings = {
        email: process.env.DEFAULT_EMAIL || '', // Add your email to .env
        phone: process.env.DEFAULT_PHONE || '', // Add your phone to .env
        email_notifications: true,
        sms_notifications: true,
        reminder_times: [1440, 60] // 24 hours and 1 hour before
      }
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

    for (const task of tasks) {
      const dueDate = new Date(task.due_date)
      
      // Check each reminder time
      for (const reminderMinutes of notificationSettings.reminder_times) {
        const reminderTime = new Date(dueDate.getTime() - (reminderMinutes * 60 * 1000))
        
        // Check if we should send a reminder now (within 5 minutes of reminder time)
        const timeDiff = Math.abs(now.getTime() - reminderTime.getTime())
        const shouldSend = testMode || timeDiff <= 5 * 60 * 1000 // 5 minutes tolerance
        
        if (shouldSend) {
          await sendNotification(task, reminderMinutes, notificationSettings, testMode)
          notificationsSent++
          break // Only send one notification per task per check
        }
      }
    }

    return Response.json({ 
      success: true, 
      tasksChecked: tasks.length,
      notificationsSent,
      message: testMode ? 'Test completed' : 'Notifications processed'
    })

  } catch (error) {
    console.error('Notification error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}

async function sendNotification(task, reminderMinutes, settings, testMode = false) {
  const dueDate = new Date(task.due_date)
  const formattedDate = dueDate.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  let timeText = ''
  if (reminderMinutes === 0) {
    timeText = 'now'
  } else if (reminderMinutes === 60) {
    timeText = 'in 1 hour'
  } else if (reminderMinutes === 1440) {
    timeText = 'tomorrow'
  } else if (reminderMinutes < 60) {
    timeText = `in ${reminderMinutes} minutes`
  } else if (reminderMinutes < 1440) {
    timeText = `in ${Math.round(reminderMinutes / 60)} hours`
  } else {
    timeText = `in ${Math.round(reminderMinutes / 1440)} days`
  }

  const subject = `Task Reminder: ${task.title}`
  const message = `Your task "${task.title}" is due ${timeText} (${formattedDate}).${task.description ? `\n\nDescription: ${task.description}` : ''}`

  const testPrefix = testMode ? '[TEST] ' : ''

  // Send email notification
  if (settings.email_notifications && settings.email) {
    try {
      await resend.emails.send({
        from: 'Task Manager <notifications@yourdomain.com>', // You'll need to set up your domain
        to: settings.email,
        subject: testPrefix + subject,
        text: message,
        html: `
          <h2>${testPrefix}Task Reminder</h2>
          <p><strong>${task.title}</strong> is due <strong>${timeText}</strong></p>
          <p><em>${formattedDate}</em></p>
          ${task.description ? `<p><strong>Description:</strong> ${task.description}</p>` : ''}
          ${task.priority > 1 ? `<p><strong>Priority:</strong> ${task.priority === 3 ? 'High' : 'Medium'}</p>` : ''}
        `
      })
      console.log(`${testPrefix}Email sent for task: ${task.title}`)
    } catch (error) {
      console.error('Email error:', error)
    }
  }

  // Send SMS notification
  if (settings.sms_notifications && settings.phone) {
    try {
      await vonage.sms.send({
        to: settings.phone,
        from: 'TaskManager',
        text: testPrefix + `Task reminder: "${task.title}" due ${timeText} (${formattedDate})`
      })
      console.log(`${testPrefix}SMS sent for task: ${task.title}`)
    } catch (error) {
      console.error('SMS error:', error)
    }
  }
}

// This endpoint can also be called by cron jobs
export async function GET() {
  // For automated calls (like from cron), use default settings
  return POST(new Request('', { 
    method: 'POST', 
    body: JSON.stringify({ testMode: false }) 
  }))
}
