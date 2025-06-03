'use client'

import { useState, useEffect } from 'react'
import { Settings, Mail, Phone, Clock, Save } from 'lucide-react'

export default function NotificationSettings({ isOpen, onClose }) {
  const [settings, setSettings] = useState({
    email: '',
    phone: '',
    email_notifications: true,
    sms_notifications: true,
    reminder_times: [1440, 60] // 24 hours and 1 hour before
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // Load settings from localStorage
      const savedSettings = localStorage.getItem('notificationSettings')
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings))
      }
    }
  }, [isOpen])

  function saveSettings() {
    setSaving(true)
    
    // Save to localStorage
    localStorage.setItem('notificationSettings', JSON.stringify(settings))
    
    setTimeout(() => {
      setSaving(false)
      alert('Settings saved successfully!')
      onClose()
    }, 500)
  }

  async function testNotifications() {
    if (!settings.email && !settings.phone) {
      alert('Please add your email or phone number first!')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          testMode: true,
          settings: settings
        })
      })
      
      const result = await response.json()
      
      if (response.ok) {
        alert(`Test completed! Checked ${result.tasksChecked} tasks, sent ${result.notificationsSent} notifications.`)
      } else {
        alert('Test failed: ' + result.error)
      }
    } catch (error) {
      alert('Test failed: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Settings size={24} />
              Notification Settings
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="space-y-6">
            {/* Contact Information */}
            <div>
              <h3 className="font-medium mb-3">Contact Information</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Mail size={16} className="inline mr-1" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({...settings, email: e.target.value})}
                    placeholder="your@email.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone size={16} className="inline mr-1" />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={settings.phone}
                    onChange={(e) => setSettings({...settings, phone: e.target.value})}
                    placeholder="+1234567890 (include country code)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Include country code (e.g., +1 for US, +359 for Bulgaria)
                  </p>
                </div>
              </div>
            </div>

            {/* Notification Types */}
            <div>
              <h3 className="font-medium mb-3">Notification Types</h3>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.email_notifications}
                    onChange={(e) => setSettings({...settings, email_notifications: e.target.checked})}
                    className="mr-2"
                  />
                  Email notifications
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.sms_notifications}
                    onChange={(e) => setSettings({...settings, sms_notifications: e.target.checked})}
                    className="mr-2"
                  />
                  SMS notifications
                </label>
              </div>
            </div>

            {/* Reminder Times */}
            <div>
              <h3 className="font-medium mb-3">
                <Clock size={16} className="inline mr-1" />
                Reminder Times
              </h3>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.reminder_times.includes(1440)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSettings({...settings, reminder_times: [...settings.reminder_times, 1440].sort((a,b) => b-a)})
                      } else {
                        setSettings({...settings, reminder_times: settings.reminder_times.filter(t => t !== 1440)})
                      }
                    }}
                    className="mr-2"
                  />
                  24 hours before due date
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.reminder_times.includes(60)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSettings({...settings, reminder_times: [...settings.reminder_times, 60].sort((a,b) => b-a)})
                      } else {
                        setSettings({...settings, reminder_times: settings.reminder_times.filter(t => t !== 60)})
                      }
                    }}
                    className="mr-2"
                  />
                  1 hour before due date
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.reminder_times.includes(0)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSettings({...settings, reminder_times: [...settings.reminder_times, 0].sort((a,b) => b-a)})
                      } else {
                        setSettings({...settings, reminder_times: settings.reminder_times.filter(t => t !== 0)})
                      }
                    }}
                    className="mr-2"
                  />
                  When due date arrives
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={saveSettings}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              
              <button
                onClick={testNotifications}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Test Now
              </button>
            </div>
            
            <p className="text-xs text-gray-500">
              The "Test Now" button will check all your pending tasks and send notifications for any that match your reminder times.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
