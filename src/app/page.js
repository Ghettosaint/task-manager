'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, Calendar, Clock, AlertTriangle, Settings, Repeat, Copy, List, ChevronLeft, ChevronRight, Bell, BellOff } from 'lucide-react'

// Mock supabase for demo - replace with your actual supabase import
const supabase = {
  from: (table) => ({
    select: (fields) => ({
      eq: (field, value) => ({
        order: (field, options) => ({
          then: (callback) => {
            // Mock data for demo
            const mockTasks = [
              {
                id: 1,
                title: 'Morning call with team',
                description: 'Discuss project updates',
                due_date: '2025-01-20T08:00:00',
                priority: 2,
                status: 'pending',
                is_recurring: false,
                notifications_enabled: true
              },
              {
                id: 2,
                title: 'Post new article',
                description: 'Publish the blog post about productivity',
                due_date: '2025-01-20T09:00:00',
                priority: 3,
                status: 'pending',
                is_recurring: false,
                notifications_enabled: true
              },
              {
                id: 3,
                title: 'Lunch meeting',
                description: 'Meet with client',
                due_date: '2025-01-20T12:30:00',
                priority: 1,
                status: 'pending',
                is_recurring: false,
                notifications_enabled: false
              }
            ]
            setTimeout(() => callback({ data: mockTasks, error: null }), 100)
          }
        })
      })
    }),
    insert: (data) => ({
      select: () => ({
        then: (callback) => {
          setTimeout(() => callback({ data: [{ id: Date.now(), ...data[0] }], error: null }), 100)
        }
      })
    }),
    update: (data) => ({
      eq: (field, value) => ({
        then: (callback) => {
          setTimeout(() => callback({ error: null }), 100)
        }
      })
    }),
    delete: () => ({
      eq: (field, value) => ({
        then: (callback) => {
          setTimeout(() => callback({ error: null }), 100)
        }
      })
    })
  })
}

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

  useEffect(() => {
    loadTasks()
  }, [])

  async function loadTasks() {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('due_date', { ascending: true, nullsLast: true })
      
      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.log('Error loading tasks:', error.message)
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
        notifications_enabled: notificationsEnabled
      }

      if (newDueDate) {
        taskData.due_date = new Date(newDueDate).toISOString()
      }

      const newTaskWithId = { id: Date.now(), ...taskData }
      setTasks(prevTasks => [...prevTasks, newTaskWithId].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return new Date(a.due_date) - new Date(b.due_date)
      }))
      
      resetForm()
    } catch (error) {
      alert('Error adding task: ' + error.message)
    }
  }

  function resetForm() {
    setNewTask('')
    setNewDescription('')
    setNewDueDate('')
    setNewPriority(1)
    setNotificationsEnabled(true)
  }

  async function toggleTask(taskId, currentStatus) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    
    setTasks(tasks.map(task => 
      task.id === taskId 
        ? { ...task, status: newStatus }
        : task
    ))
  }

  async function toggleNotifications(taskId, currentEnabled) {
    setTasks(tasks.map(task => 
      task.id === taskId 
        ? { ...task, notifications_enabled: !currentEnabled }
        : task
    ))
  }

  async function deleteTask(taskId) {
    setTasks(tasks.filter(task => task.id !== taskId))
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
            <h1 className="text-3xl font-bold text-gray-900">My Task Manager</h1>
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
            
            <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>Low</option>
                  <option value={2}>Medium</option>
                  <option value={3}>High</option>
                </select>
              </div>
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
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
