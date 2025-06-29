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

  function getWeekDates(date) {
    const startOfWeek = new Date(date)
    const day = startOfWeek.getDay()
    startOfWeek.setDate(startOfWeek.getDate() - day)
    
    const dates = []
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startOfWeek)
      currentDate.setDate(startOfWeek.getDate() + i)
      dates.push(currentDate)
    }
    return dates
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

  function navigateWeek(direction) {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + (direction * 7))
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
    
    let display = `Repeats every ${task.recurrence_interval} ${task.recurrence_type}`
    
    if (task.recurrence_type === 'custom' && task.recurrence_days) {
      try {
        const days = JSON.parse(task.recurrence_days)
        if (days.length > 0) {
          display += ` on ${days.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')}`
        }
      } catch (e) {
        console.error('Error parsing recurrence days:', e)
      }
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading your tasks...</div>
      </div>
    )
  }

  const sortedTasks = sortTasksByTime(tasks)

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Deyan's Task Manager</h1>
            <p className="text-sm text-gray-600">Stay organized and never miss important tasks</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white rounded-lg p-1 border shadow-sm flex">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 rounded flex items-center gap-2 ${
                  viewMode === 'list' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <List size={18} />
                List
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-2 rounded flex items-center gap-2 ${
                  viewMode === 'calendar' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Calendar size={18} />
                Calendar
              </button>
            </div>
            
            <button 
              onClick={handleSettingsClick}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border bg-white shadow-sm transition-colors"
              title="Notification Settings"
            >
              <Settings size={24} />
            </button>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="space-y-4">
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="What do you need to do?"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
            
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
            
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value={1}>Low</option>
                  <option value={2}>Medium</option>
                  <option value={3}>High</option>
                </select>
              </div>
            </div>

            {/* Recurring Task Options */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="recurring" className="flex items-center gap-1 text-sm font-medium text-gray-700">
                  <Repeat size={16} />
                  Make this a recurring task
                </label>
              </div>

              {isRecurring && (
                <div className="space-y-3 ml-6 p-3 bg-gray-50 rounded-lg">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Repeat every
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          value={recurrenceInterval}
                          onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-gray-900"
                        />
                        <select
                          value={recurrenceType}
                          onChange={(e) => setRecurrenceType(e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-gray-900"
                        >
                          <option value="daily">Day(s)</option>
                          <option value="weekly">Week(s)</option>
                          <option value="monthly">Month(s)</option>
                          <option value="yearly">Year(s)</option>
                          <option value="custom">Custom days</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End date (optional)
                      </label>
                      <input
                        type="date"
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-gray-900"
                      />
                    </div>
                  </div>

                  {recurrenceType === 'custom' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select days
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => handleRecurrenceDayToggle(day)}
                            className={`px-3 py-1 text-xs rounded border ${
                              recurrenceDays.includes(day)
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-600'
                            }`}
                          >
                            {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notifications"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="notifications" className="flex items-center gap-1 text-sm font-medium text-gray-700">
                <Bell size={16} />
                Enable notifications for this task
              </label>
            </div>
            
            <button
              onClick={addTask}
              disabled={!newTask.trim()}
              className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Add Task
            </button>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="bg-white rounded-lg shadow-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <button
                onClick={() => navigateWeek(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft size={20} />
              </button>
              
              <h2 className="text-lg font-semibold">
                {currentDate.toLocaleDateString('en-US', { 
                  month: 'long', 
                  year: 'numeric' 
                })}
              </h2>
              
              <button
                onClick={() => navigateWeek(1)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-3 border-b border-r text-center font-medium text-gray-600 bg-gray-50">
                  {day}
                </div>
              ))}
              
              {getWeekDates(currentDate).map((date, index) => {
                const dayTasks = getTasksForDate(date)
                const isToday = date.toDateString() === new Date().toDateString()
                
                return (
                  <div key={index} className={`min-h-[200px] p-2 border-r border-b ${isToday ? 'bg-blue-50' : ''}`}>
                    <div className={`text-sm font-medium mb-2 ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                      {date.getDate()}
                    </div>
                    
                    <div className="space-y-1">
                      {dayTasks.map(task => (
                        <div
                          key={task.id}
                          className={`text-xs p-2 rounded border-l-2 ${
                            task.status === 'completed'
                              ? 'bg-green-50 border-green-500 text-green-700'
                              : isOverdue(task.due_date)
                              ? 'bg-red-50 border-red-500 text-red-700'
                              : 'bg-white border-blue-500 text-gray-900'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => toggleTask(task.id, task.status)}
                                className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                                  task.status === 'completed'
                                    ? 'bg-green-600 border-green-600 text-white'
                                    : 'border-gray-300'
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
                                  <Bell size={10} className="text-blue-500" />
                                ) : (
                                  <BellOff size={10} className="text-gray-400" />
                                )}
                              </button>
                              <button
                                onClick={() => deleteTask(task.id)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>
                          
                          <div className={task.status === 'completed' ? 'line-through' : ''}>
                            {task.title}
                          </div>
                          
                          {task.priority > 1 && (
                            <div className={`text-xs font-medium ${getPriorityColor(task.priority)}`}>
                              {getPriorityLabel(task.priority)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Tasks (sorted by time)</h2>
            
            {sortedTasks.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                No tasks yet. Add one above to get started!
              </div>
            ) : (
              sortedTasks.map((task) => (
                <div
                  key={task.id}
                  className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${
                    task.status === 'completed' 
                      ? 'opacity-60 border-green-500' 
                      : isOverdue(task.due_date)
                      ? 'border-red-500'
                      : isDueToday(task.due_date)
                      ? 'border-yellow-500'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleTask(task.id, task.status)}
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        task.status === 'completed'
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'border-gray-300 hover:border-green-600'
                      }`}
                    >
                      {task.status === 'completed' && <Check size={16} />}
                    </button>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`${
                            task.status === 'completed'
                              ? 'line-through text-gray-500'
                              : 'text-gray-900'
                          }`}
                        >
                          {task.title}
                        </span>
                        
                        {task.is_recurring && (
                          <Repeat size={16} className="text-purple-500" title="Recurring task" />
                        )}
                        
                        {task.priority > 1 && (
                          <span className={`text-xs font-medium ${getPriorityColor(task.priority)}`}>
                            {getPriorityLabel(task.priority)}
                          </span>
                        )}
                      </div>
                      
                      {task.description && (
                        <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                      )}
                      
                      {task.due_date && (
                        <div className={`flex items-center gap-1 text-sm mt-1 ${
                          isOverdue(task.due_date) && task.status !== 'completed'
                            ? 'text-red-600'
                            : isDueToday(task.due_date) && task.status !== 'completed'
                            ? 'text-yellow-600'
                            : 'text-gray-500'
                        }`}>
                          {isOverdue(task.due_date) && task.status !== 'completed' ? (
                            <AlertTriangle size={14} />
                          ) : (
                            <Calendar size={14} />
                          )}
                          <span>{formatDate(task.due_date)}</span>
                          {isOverdue(task.due_date) && task.status !== 'completed' && (
                            <span className="font-medium">- Overdue</span>
                          )}
                        </div>
                      )}

                      {task.is_recurring && (
                        <div className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                          <Repeat size={12} />
                          <span>{getRecurrenceDisplay(task)}</span>
                        </div>
                      )}

                      {task.next_due_date && task.is_recurring && (
                        <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                          <Clock size={12} />
                          <span>Next: {formatDate(task.next_due_date)}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleNotifications(task.id, task.notifications_enabled)}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title={task.notifications_enabled ? 'Disable notifications' : 'Enable notifications'}
                      >
                        {task.notifications_enabled ? <Bell size={18} /> : <BellOff size={18} />}
                      </button>
                      
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
