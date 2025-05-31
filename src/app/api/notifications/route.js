import { NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase'
import { Vonage } from '@vonage/server-sdk'
import { Resend } from 'resend'

// Initialize services
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET
})

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST() {
  try {
    console.log('🔔 Starting notification check...')
    
    // Get all pending tasks with due dates
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'pending')
      .not('due_date', 'is', null)
    
    if (tasksError) throw tasksError
    
    // Get user settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .limit(1)
      .single()
    
    if (settingsError || !settings) {
      console.log('❌ No user settings found')
      return NextResponse.json({ message: 'No user settings configured' })
    }
    
    console.log(`📋 Found ${tasks.length} pending tasks`)
    
    const notifications = []
    const now = new Date()
    
    for (const task of tasks) {
      const dueDate = new Date(task.due_date)
      const timeDiff = dueDate.getTime() - now.getTime()
      const minutesUntilDue = Math.floor(timeDiff / (1000 * 60))
      
      // Check if we should send a notification
      const shouldNotify = settings.reminder_times.some(reminderMinutes => {
        // Allow some tolerance (5 minutes) for timing
        return Math.abs(minutesUntilDue - reminderMinutes) <= 5
      })
      
      if (shouldNotify) {
        notifications.push({
          task,
          minutesUntilDue,
          dueDate
        })
      }
    }
    
    console.log(`🎯 Found ${notifications.length} tasks needing notifications`)
    
    // Send notifications
    const results = []
    
    for (const notification of notifications) {
      const { task, minutesUntilDue } = notification
      
      let timeMessage
      if (minutesUntilDue <= 0) {
        timeMessage = 'is due now!'
      } else if (minutesUntilDue < 60) {
        timeMessage = `is due in ${minutesUntilDue} minutes`
      } else if (minutesUntilDue < 1440) {
        const hours = Math.floor(minutesUntilDue / 60)
        timeMessage = `is due in ${hours} hour${hours > 1 ? 's' : ''}`
      } else {
        const days = Math.floor(minutesUntilDue / 1440)
        timeMessage = `is due in ${days} day${days > 1 ? 's' : ''}`
      }
      
      const message = `⏰ Task Reminder: "${task.title}" ${timeMessage}`
      
      // Send email notification
      if (settings.email_notifications && settings.email) {
        try {
          await resend.emails.send({
            from: 'Task Manager <onboarding@resend.dev>',
            to: [settings.email],
            subject: `Task Reminder: ${task.title}`,
            html: `
              <h2>📋 Task Reminder</h2>
              <p><strong>${task.title}</strong> ${timeMessage}</p>
              ${task.description ? `<p>Description: ${task.description}</p>` : ''}
              <p>Priority: ${task.priority === 3 ? 'High' : task.priority === 2 ? 'Medium' : 'Low'}</p>
              <p>Due: ${new Date(task.due_date).toLocaleString()}</p>
            `
          })
          
          results.push({ type: 'email', task: task.title, status: 'sent' })
          console.log(`📧 Email sent for task: ${task.title}`)
        } catch (error) {
          console.error('Email error:', error)
          results.push({ type: 'email', task: task.title, status: 'failed', error: error.message })
        }
      }
      
      // Send SMS notification
      if (settings.sms_notifications && settings.phone) {
        try {
          await vonage.sms.send({
            to: settings.phone,
            from: 'TaskManager',
            text: message
          })
          
          results.push({ type: 'sms', task: task.title, status: 'sent' })
          console.log(`📱 SMS sent for task: ${task.title}`)
        } catch (error) {
          console.error('SMS error:', error)
          results.push({ type: 'sms', task: task.title, status: 'failed', error: error.message })
        }
      }
    }
    
    console.log('✅ Notification check complete')
    
    return NextResponse.json({
      message: 'Notification check complete',
      tasksChecked: tasks.length,
      notificationsSent: results.length,
      results
    })
    
  } catch (error) {
    console.error('Notification error:', error)
    return NextResponse.json(
      { error: 'Failed to process notifications', details: error.message },
      { status: 500 }
    )
  }
}