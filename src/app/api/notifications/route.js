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
      reminder_times: [1440, 60]
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
    
    console.log(`Current time (UTC): ${now.toISOString()}`)
    console.log(`Current time (EEST): ${new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString()}`)
    console.log(`Found ${tasks.length} pending tasks with due dates`)

    // Check each task for notification triggers
    for (const task of tasks) {
      // Assume task due_date is in EEST (UTC+3), adjust for server UTC time
      const dueDate = new Date(task.due_date)
      const dueDateUTC = new Date(dueDate.getTime() - 3 * 60 * 60 * 1000) // Convert EEST to UTC
      
      console.log(`Checking task: ${task.title}`)
      console.log(`  Stored due date: ${dueDate.toISOString()}`)
      console.log(`  Adjusted to UTC: ${dueDateUTC.toISOString()}`)
      
      for (const reminderMinutes of notificationSettings.reminder_times) {
        const reminderTime = new Date(dueDateUTC.getTime() - (reminderMinutes * 60 * 1000))
        const timeDiff = Math.abs(now.getTime() - reminderTime.getTime())
        const hoursUntilDue = (dueDateUTC.getTime() - now.getTime()) / (1000 * 60 * 60)
        const shouldSend = sendNow || testMode || (hoursUntilDue > 0 && hoursUntilDue <= 24)
        
        console.log(`  Reminder ${reminderMinutes}min: reminderTime=${reminderTime.toISOString()}, timeDiff=${Math.round(timeDiff/60000)}min, shouldSend=${shouldSend}`)
    
        if (shouldSend) {
          const hoursUntilDue = Math.round((dueDateUTC.getTime() - now.getTime()) / (1000 * 60 * 60))
          const dueText = hoursUntilDue > 0 ? `in ${hoursUntilDue} hours` : hoursUntilDue === 0 ? 'today' : 'overdue'
          
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
                      <p style="margin: 0; font-weight: bold; color: ${hoursUntilDue <= 0 ? '#dc2626' : '#2563eb'};">
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
              console.log(`Email sent for task: ${task.title}`, emailResult)
            } catch (emailError) {
              console.error('Email error details:', emailError.message, emailError)
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
              console.log(`SMS sent for task: ${task.title}`, smsResult)
            } catch (smsError) {
              console.error('SMS error details:', smsError.message, smsError)
            }
          }

          notificationsSent++
          break // Only send one notification per task
        }
      }
    }

    return Response.json({ 
      success: true, 
      tasksChecked: tasks.length,
      notificationsSent,
      message: testMode ? 
        `Test completed - ${notificationsSent} notifications sent` : 
        `${notificationsSent} notifications sent`
    })

  } catch (error) {
    console.error('Notification error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  return POST(new Request('', { 
    method: 'POST', 
    body: JSON.stringify({ testMode: false }) 
  }))
}
