import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getServerSession } from 'next-auth'
import { supabase } from '../../../../lib/supabase'

export async function POST(request) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action, taskId, eventData } = await request.json()

    // Get user's Google tokens from database
    const { data: account } = await supabase
      .from('accounts')
      .select('access_token, refresh_token')
      .eq('userId', session.userId)
      .eq('provider', 'google')
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Google account not linked' }, { status: 400 })
    }

    // Set up Google Calendar API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + '/api/auth/callback/google'
    )

    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token
    })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    switch (action) {
      case 'create':
        return await createCalendarEvent(calendar, taskId, eventData)
      case 'update':
        return await updateCalendarEvent(calendar, taskId, eventData)
      case 'delete':
        return await deleteCalendarEvent(calendar, taskId)
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Calendar API error:', error)
    return NextResponse.json({ error: 'Calendar operation failed' }, { status: 500 })
  }
}

async function createCalendarEvent(calendar, taskId, eventData) {
  try {
    // Get task details
    const { data: task } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Create calendar event
    const event = {
      summary: task.title,
      description: task.description || '',
      start: {
        dateTime: eventData.startTime || task.due_date,
        timeZone: eventData.timeZone || 'America/Los_Angeles'
      },
      end: {
        dateTime: eventData.endTime || new Date(new Date(eventData.startTime || task.due_date).getTime() + 60*60*1000).toISOString(),
        timeZone: eventData.timeZone || 'America/Los_Angeles'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 10 },
          { method: 'email', minutes: 60 }
        ]
      }
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    })

    // Update task with Google Calendar event ID
    await supabase
      .from('tasks')
      .update({ google_event_id: response.data.id })
      .eq('id', taskId)

    return NextResponse.json({
      success: true,
      eventId: response.data.id,
      eventUrl: response.data.htmlLink
    })
  } catch (error) {
    console.error('Create event error:', error)
    return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 })
  }
}

async function updateCalendarEvent(calendar, taskId, eventData) {
  try {
    const { data: task } = await supabase
      .from('tasks')
      .select('google_event_id, title, description, due_date')
      .eq('id', taskId)
      .single()

    if (!task || !task.google_event_id) {
      return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 })
    }

    const event = {
      summary: task.title,
      description: task.description || '',
      start: {
        dateTime: eventData.startTime || task.due_date,
        timeZone: eventData.timeZone || 'America/Los_Angeles'
      },
      end: {
        dateTime: eventData.endTime || new Date(new Date(eventData.startTime || task.due_date).getTime() + 60*60*1000).toISOString(),
        timeZone: eventData.timeZone || 'America/Los_Angeles'
      }
    }

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: task.google_event_id,
      resource: event
    })

    return NextResponse.json({
      success: true,
      eventUrl: response.data.htmlLink
    })
  } catch (error) {
    console.error('Update event error:', error)
    return NextResponse.json({ error: 'Failed to update calendar event' }, { status: 500 })
  }
}

async function deleteCalendarEvent(calendar, taskId) {
  try {
    const { data: task } = await supabase
      .from('tasks')
      .select('google_event_id')
      .eq('id', taskId)
      .single()

    if (!task || !task.google_event_id) {
      return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 })
    }

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: task.google_event_id
    })

    // Remove the Google event ID from the task
    await supabase
      .from('tasks')
      .update({ google_event_id: null })
      .eq('id', taskId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete event error:', error)
    return NextResponse.json({ error: 'Failed to delete calendar event' }, { status: 500 })
  }
}