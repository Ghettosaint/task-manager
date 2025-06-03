// Notifications API temporarily disabled for PWA deployment
// Will be re-enabled once import paths are resolved

export async function POST(request) {
  try {
    const body = await request.json()
    const { testMode = false } = body

    // For now, just return a success message
    return Response.json({ 
      success: true, 
      tasksChecked: 0,
      notificationsSent: 0,
      message: testMode ? 'Test completed (notifications temporarily disabled)' : 'Notifications temporarily disabled'
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
