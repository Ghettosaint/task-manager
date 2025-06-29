'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, Calendar, Clock, AlertTriangle, Settings, Repeat, Copy, List, ChevronLeft, ChevronRight, Bell, BellOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import NotificationSettings from './NotificationSettings'

export default function TaskManager() {
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newPriority, setNewPriority] = useState(1)
  const [newDescription, setNewDescription] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('list')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  
  // New recurring task states
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState('daily')
  const [recurrenceInterval, setRecurrenceInterval] = useState(1)
  const [recurrenceDays, setRecurrenceDays] = useState([])
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')

  useEffect(() => {
    loadTasks()
  }, [])

  async function loadTasks() {
    try {
      console.log('Loading tasks from Supabase...')
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('due_date', { ascending: true, nullsLast: true })
      
      if (error) {
        console.error('Supabase error:', error)
        throw error
      }
      
      console.log('Tasks loaded:', data)
      setTasks(data || [])
    } catch (error) {
      console.error('Error loading tasks:', error.message)
      // For now, let's use mock data if Supabase fails
      setTasks([
        {
          id: 1,
          title: 'Sample Task',
          description: 'This is a sample task',
          status: 'pending',
          priority: 2,
          notifications_enabled: true,
          due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  async function addTask() {
    if (!newTask.trim()) return

    try {
      const taskData = {
        title: newTask.trim(),
        description: newDescription.trim() || null,
        status: 'pending',
        priority: newPriority,
        notifications_enabled: notificationsEnabled,
        is_recurring: isRecurring,
        recurrence_type: isRecurring ? recurrenceType : null,
        recurrence_interval: isRecurring ? recurrenceInterval : null,
        recurrence_days: isRecurring && recurrenceDays.length > 0 ? JSON.stringify(recurrenceDays) : null,
        recurrence_end_date: isRecurring && recurrenceEndDate ? new Date(recurrenceEndDate).toISOString() : null
      }

      if (newDueDate) {
        taskData.due_date = new Date(newDueDate).toISOString()
        if (isRecurring) {
          taskData.next_due_date = calculateNextDueDate(new Date(newDueDate), recurrenceType, recurrenceInterval, recurrenceDays)
        }
      }

      console.log('Creating task with data:', taskData)

      // Save to Supabase
      const { data, error } = await supabase
        .from('tasks')
        .insert([taskData])
        .select()

      if (error) {
        console.error('Error creating task:', error)
        throw error
      }
      
      console.log('Task created successfully:', data)
      
      // Reload tasks from database
      await loadTasks()
      resetForm()
    } catch (error) {
      alert('Error adding task: ' + error.message)
    }
  }

  function calculateNextDueDate(currentDue, type, interval, days) {
    const nextDue = new Date(currentDue)
    
    console.log('Calculating next due date:', { currentDue, type, interval, days })
    
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
    
    console.log('Next due date calculated:', nextDue.toISOString())
    return nextDue.toISOString()
  }

  function resetForm() {
    setNewTask('')
    setNewDescription('')
    setNewDueDate('')
    setNewPriority(1)
    setNotificationsEnabled(true)
    setIsRecurring(false)
    setRecurrenceType('daily')
    setRecurrenceInterval(1)
    setRecurrenceDays([])
    setRecurrenceEndDate('')
  }

  async function toggleTask(taskId, currentStatus) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId)

      if (error) throw error

      // If completing a recurring task, create next occurrence
      if (newStatus === 'completed') {
        const task = tasks.find(t => t.id === taskId)
        if (task && task.is_recurring && task.next_due_date) {
          console.log('Creating next occurrence for completed recurring task:', task.title)
          await createNextRecurringTask(task)
        }
      }

      // Update local state
      setTasks(tasks.map(task => 
        task.id === taskId 
          ? { ...task, status: newStatus }
          : task
      ))
    } catch (error) {
      alert('Error updating task: ' + error.message)
    }
  }

  async function createNextRecurringTask(originalTask) {
    try {
      console.log('Creating next recurring task instance for:', originalTask.title)
      
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

      console.log('Creating next task with data:', nextTaskData)

      const { data, error } = await supabase
        .from('tasks')
        .insert([nextTaskData])
        .select()

      if (error) {
        console.error('Error creating next recurring task:', error)
        throw error
      }

      console.log('Next recurring task created successfully:', data)

      // Reload tasks to show the new occurrence
      await loadTasks()
    } catch (error) {
      console.error('Error in createNextRecurringTask:', error)
    }
  }

  async function toggleNotifications(taskId, currentEnabled) {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ notifications_enabled: !currentEnabled })
        .eq('id', taskId)

      if (error) throw error

      setTasks(tasks.map(task => 
        task.id === taskId 
          ? { ...task, notifications_enabled: !currentEnabled }
          : task
      ))
    } catch (error) {
      alert('Error updating notifications: ' + error.message)
    }
  }

  async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return
    
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)

      if (error) throw error

      setTasks(tasks.filter(task => task.id !== taskId))
    } catch (error) {
      alert('Error deleting task: ' + error.message)
    }
  }

  function handleRecurrenceDayToggle(day) {
    if (recurrenceDays.includes(day)) {
      setRecurrenceDays(recurrenceDays.filter(d => d !== day))
    } else {
      setRecurrenceDays([...recurrenceDays, day])
    }
  }

  function formatDate(dateString) {
    if (!dateString) return null
    const date = new Date(dateString)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    
    if (dateOnly.getTime() === today.getTime()) {
      return `Today at ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
    } else if (dateOnly.getTime() === tomorrow.getTime()) {
      return `Tomorrow at ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
    } else {
      return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  function formatTime(dateString) {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
  }

  function isOverdue(dateString) {
    if (!dateString) return false
    const dueDate = new Date(dateString)
    const now = new Date()
    return dueDate < now
  }

  function isDueToday(dateString) {
    if (!dateString) return false
    const dueDate = new Date(dateString)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
    return dateOnly.getTime() === today.getTime()
  }

  function getPriorityColor(priority) {
    switch (priority) {
      case 3: return 'text-red-600'
      case 2: return 'text-yellow-600'
      default: return 'text-gray-400'
    }
  }

  function getPriorityLabel(priority) {
    switch (priority) {
      case 3: return 'High'
      case 2: return 'Medium'
      default: return 'Low'
    }
  }

  // Updated to get full month calendar
  function getMonthDates(date) {
    const year = date.getFullYear()
    const month = date.getMonth()
    
    // First day of the month
    const firstDay = new Date(year, month, 1)
    
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0)
    
    // First day of the calendar (might be from previous month)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay())
    
    // Generate all dates for the calendar grid
    const dates = []
    const currentDate = new Date(startDate)
    
    // Generate 6 weeks (42 days) to ensure full month view
    for (let i = 0; i < 42; i++) {
      dates.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return { dates, currentMonth: month, currentYear: year }
  }

  function getTasksForDate(date) {
    const dateStr = date.toDateString()
    return tasks
      .filter(task => {
        if (!task.due_date) return false
        const taskDate = new Date(task.due_date)
        return taskDate.toDateString() === dateStr
      })
      .sort((a, b) => {
        const timeA = new Date(a.due_date)
        const timeB = new Date(b.due_date)
        return timeA.getTime() - timeB.getTime()
      })
  }

  function navigateMonth(direction) {
    const newDate = new Date(currentDate)
    newDate.setMonth(newDate.getMonth() + direction)
    setCurrentDate(newDate)
  }

  function sortTasksByTime(tasksToSort) {
    return tasksToSort.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      
      const dateA = new Date(a.due_date)
      const dateB = new Date(b.due_date)
      
      if (dateA.toDateString() === dateB.toDateString()) {
        return dateA.getTime() - dateB.getTime()
      }
      
      return dateA.getTime() - dateB.getTime()
    })
  }

  function getRecurrenceDisplay(task) {
    if (!task.is_recurring) return null
    
    let display = `Repeats every `
    
    if (task.recurrence_interval > 1) {
      display += `${task.recurrence_interval} `
    }
    
    switch (task.recurrence_type) {
      case 'daily':
        display += task.recurrence_interval === 1 ? 'day' : 'days'
        break
      case 'weekly':
        display += task.recurrence_interval === 1 ? 'week' : 'weeks'
        break
      case 'monthly':
        display += task.recurrence_interval === 1 ? 'month' : 'months'
        break
      case 'yearly':
        display += task.recurrence_interval === 1 ? 'year' : 'years'
        break
      case 'custom':
        if (task.recurrence_days) {
          try {
            const days = JSON.parse(task.recurrence_days)
            if (days.length > 0) {
              display = `Repeats on ${days.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')}`
            }
          } catch (e) {
            console.error('Error parsing recurrence days:', e)
            display = 'Custom recurrence'
          }
        } else {
          display = 'Custom recurrence'
        }
        break
      default:
        display = 'Recurring task'
    }
    
    if (task.recurrence_end_date) {
      const endDate = new Date(task.recurrence_end_date)
      display += ` until ${endDate.toLocaleDateString()}`
    }
    
    return display
  }

  // Function to handle settings button click
  function handleSettingsClick() {
    console.log('Settings button clicked!')
    setShowNotificationSettings(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-lg text-gray-700">Loading your tasks...</div>
      </div>
    )
  }

  const sortedTasks = sortTasksByTime(tasks)
  const { dates: monthDates, currentMonth, currentYear } = getMonthDates(currentDate)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Deyan's Task Manager
            </h1>
            <p className="text-gray-600 mt-2">Stay organized and never miss important tasks</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl p-1 border shadow-sm flex">
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                  viewMode === 'list' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <List size={18} />
                List
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                  viewMode === 'calendar' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Calendar size={18} />
                Calendar
              </button>
            </div>
            
            <button 
              onClick={handleSettingsClick}
              className="p-3 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-xl border bg-white/80 backdrop-blur-sm shadow-sm transition-all hover:shadow-md"
              title="Notification Settings"
            >
              <Settings size={24} />
            </button>
          </div>
        </div>
        
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-6 border">
          <div className="space-y-6">
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="What do you need to do?"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white/50"
            />
            
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white/50"
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Due Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white/50"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(parseInt(e.target.value))}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white/50"
                >
                  <option value={1}>Low</option>
                  <option value={2}>Medium</option>
                  <option value={3}>High</option>
                </select>
              </div>
            </div>

            {/* Enhanced Recurring Task Options */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="recurring" className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Repeat size={18} className="text-purple-500" />
                  Make this a recurring task
                </label>
              </div>

              {isRecurring && (
                <div className="space-y-4 ml-8 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Repeat every
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          value={recurrenceInterval}
                          onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                          className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-purple-500"
                        />
                        <select
                          value={recurrenceType}
                          onChange={(e) => setRecurrenceType(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="daily">Day(s)</option>
                          <option value="weekly">Week(s)</option>
                          <option value="monthly">Month(s)</option>
                          <option value="yearly">Year(s)</option>
                          <option value="custom">Custom days</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End date (optional)
                      </label>
                      <input
                        type="date"
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {recurrenceType === 'custom' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Select days
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => handleRecurrenceDayToggle(day)}
                            className={`px-4 py-2 text-sm rounded-lg border transition-all ${
                              recurrenceDays.includes(day)
                                ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-purple-600 hover:shadow-sm'
                            }`}
                          >
                            {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-sm text-purple-600 bg-purple-50 p-3 rounded-lg">
                    <strong>Preview:</strong> {getRecurrenceDisplay({
                      is_recurring: true,
                      recurrence_type: recurrenceType,
                      recurrence_interval: recurrenceInterval,
                      recurrence_days: recurrenceDays.length > 0 ? JSON.stringify(recurrenceDays) : null,
                      recurrence_end_date: recurrenceEndDate
                    }) || 'Configure your recurrence pattern above'}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="notifications"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="notifications" className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Bell size={18} className="text-blue-500" />
                Enable notifications for this task
              </label>
            </div>
            
            <button
              onClick={addTask}
              disabled={!newTask.trim()}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl"
            >
              <Plus size={20} />
              Add Task
            </button>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <button
                onClick={() => navigateMonth(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={24} />
              </button>
              
              <h2 className="text-2xl font-bold text-gray-900">
                {new Date(currentYear, currentMonth).toLocaleDateString('en-US', { 
                  month: 'long', 
                  year: 'numeric' 
                })}
              </h2>
              
              <button
                onClick={() => navigateMonth(1)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight size={24} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-4 border-b border-r border-gray-200 text-center font-semibold text-gray-700 bg-gray-50">
                  {day}
                </div>
              ))}
              
              {monthDates.map((date, index) => {
                const dayTasks = getTasksForDate(date)
                const isToday = date.toDateString() === new Date().toDateString()
                const isCurrentMonth = date.getMonth() === currentMonth
                
                return (
                  <div key={index} className={`min-h-[120px] p-2 border-r border-b border-gray-200 ${
                    isToday ? 'bg-blue-50' : 
                    isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                  }`}>
                    <div className={`text-sm font-medium mb-2 ${
                      isToday ? 'text-blue-600 font-bold' : 
                      isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {date.getDate()}
                    </div>
                    
                    <div className="space-y-1">
                      {dayTasks.slice(0, 3).map(task => (
                        <div
                          key={task.id}
                          className={`text-xs p-2 rounded-lg border-l-2 cursor-pointer hover:shadow-sm transition-all ${
                            task.status === 'completed'
                              ? 'bg-green-50 border-green-500 text-green-700'
                              : isOverdue(task.due_date)
                              ? 'bg-red-50 border-red-500 text-red-700'
                              : 'bg-white border-blue-500 text-gray-900'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => toggleTask(task.id, task.status)}
                                className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                                  task.status === 'completed'
                                    ? 'bg-green-600 border-green-600 text-white'
                                    : 'border-gray-300 hover:border-green-500'
                                }`}
                              >
                                {task.status === 'completed' && <Check size={8} />}
                              </button>
                              <span className="font-medium">{formatTime(task.due_date)}</span>
                              {task.is_recurring && <Repeat size={8} className="text-purple-500" />}
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => toggleNotifications(task.id, task.notifications_enabled)}
                                className="cursor-pointer"
                              >
                                {task.notifications_enabled ? (
                                  <Bell size={8} className="text-blue-500" />
                                ) : (
                                  <BellOff size={8} className="text-gray-400" />
                                )}
                              </button>
                              <button
                                onClick={() => deleteTask(task.id)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <Trash2 size={8} />
                              </button>
                            </div>
                          </div>
                          
                          <div className={`font-medium ${task.status === 'completed' ? 'line-through' : ''}`}>
                            {task.title}
                          </div>
                          
                          {task.priority > 1 && (
                            <div className={`text-xs font-medium ${getPriorityColor(task.priority)}`}>
                              {getPriorityLabel(task.priority)}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {dayTasks.length > 3 && (
                        <div className="text-xs text-gray-500 text-center py-1">
                          +{dayTasks.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Tasks</h2>
            
            {sortedTasks.length === 0 ? (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-8 text-center text-gray-500 border">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-lg font-medium mb-2">No tasks yet</h3>
                <p>Add your first task above to get started!</p>
              </div>
            ) : (
              sortedTasks.map((task) => (
                <div
                  key={task.id}
                  className={`bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border-l-4 transition-all hover:shadow-xl ${
                    task.status === 'completed' 
                      ? 'opacity-60 border-green-500' 
                      : isOverdue(task.due_date)
                      ? 'border-red-500'
                      : isDueToday(task.due_date)
                      ? 'border-yellow-500'
                      : 'border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleTask(task.id, task.status)}
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        task.status === 'completed'
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'border-gray-300 hover:border-green-600 hover:bg-green-50'
                      }`}
                    >
                      {task.status === 'completed' && <Check size={16} />}
                    </button>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={`text-lg font-medium ${
                            task.status === 'completed'
                              ? 'line-through text-gray-500'
                              : 'text-gray-900'
                          }`}
                        >
                          {task.title}
                        </span>
                        
                        {task.is_recurring && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                            <Repeat size={12} />
                            Recurring
                          </div>
                        )}
                        
                        {task.priority > 1 && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            task.priority === 3 ? 'bg-red-100 text-red-700' :
                            task.priority === 2 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {getPriorityLabel(task.priority)} Priority
                          </span>
                        )}
                      </div>
                      
                      {task.description && (
                        <p className="text-gray-600 mb-3">{task.description}</p>
                      )}
                      
                      {task.due_date && (
                        <div className={`flex items-center gap-2 text-sm mb-2 ${
                          isOverdue(task.due_date) && task.status !== 'completed'
                            ? 'text-red-600'
                            : isDueToday(task.due_date) && task.status !== 'completed'
                            ? 'text-yellow-600'
                            : 'text-gray-500'
                        }`}>
                          {isOverdue(task.due_date) && task.status !== 'completed' ? (
                            <AlertTriangle size={16} />
                          ) : (
                            <Calendar size={16} />
                          )}
                          <span>{formatDate(task.due_date)}</span>
                          {isOverdue(task.due_date) && task.status !== 'completed' && (
                            <span className="font-medium bg-red-100 px-2 py-1 rounded text-red-700">Overdue</span>
                          )}
                        </div>
                      )}

                      {task.is_recurring && (
                        <div className="text-sm text-purple-600 mb-2 flex items-center gap-2 bg-purple-50 px-3 py-2 rounded-lg">
                          <Repeat size={14} />
                          <span>{getRecurrenceDisplay(task)}</span>
                        </div>
                      )}

                      {task.next_due_date && task.is_recurring && (
                        <div className="text-sm text-blue-600 flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg">
                          <Clock size={14} />
                          <span>Next occurrence: {formatDate(task.next_due_date)}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleNotifications(task.id, task.notifications_enabled)}
                        className={`p-2 rounded-lg transition-all ${
                          task.notifications_enabled 
                            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' 
                            : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                        title={task.notifications_enabled ? 'Disable notifications' : 'Enable notifications'}
                      >
                        {task.notifications_enabled ? <Bell size={20} /> : <BellOff size={20} />}
                      </button>
                      
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {showNotificationSettings && (
          <NotificationSettings
            isOpen={showNotificationSettings}
            onClose={() => setShowNotificationSettings(false)}
          />
        )}
      </div>
    </div>
  )
}
