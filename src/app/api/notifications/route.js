import { supabase } from '../../../../lib/supabase'

export async function POST(request) {
  try {
    const body = await request.json()
    const { testMode = false, settings } = body

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

    // For now, just simulate checking tasks without actual email/SMS
    for (const task of tasks) {
      const dueDate = new Date(task.due_date)
      
      for (const reminderMinutes of notificationSettings.reminder_times) {
        const reminderTime = new Date(dueDate.getTime() - (reminderMinutes * 60 * 1000))
        const timeDiff = Math.abs(now.getTime() - reminderTime.getTime())
        const shouldSend = testMode || timeDiff <= 5 * 60 * 1000
        
        if (shouldSend) {
          console.log(`Would send notification for: ${task.title}`)
          notificationsSent++
          break
        }
      }
    }

    return Response.json({ 
      success: true, 
      tasksChecked: tasks.length,
      notificationsSent,
      message: testMode ? 'Test completed (email/SMS temporarily disabled)' : 'Notifications checked'
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
