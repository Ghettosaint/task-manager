'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Trash2, Check, Calendar, Clock, AlertTriangle, Settings, Repeat, Copy } from 'lucide-react'
import NotificationSettings from './NotificationSettings.js'

export default function TaskManager() {
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newPriority, setNewPriority] = useState(1)
  const [newDescription, setNewDescription] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState('weekly')
  const [recurrenceInterval, setRecurrenceInterval] = useState(1)
  const [weeklyDays, setWeeklyDays] = useState([])
  const [monthlyDay, setMonthlyDay] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    loadTasks()
    generateRecurringTasks()
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

  async function generateRecurringTasks() {
    try {
      const { data: recurringTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('is_recurring', true)
        .is('parent_task_id', null)
      
      if (error) throw error

      const now = new Date()
      const futureLimit = new Date()
      futureLimit.setDate(futureLimit.getDate() + 60)

      for (const parentTask of recurringTasks) {
        await generateInstancesForTask(parentTask, now, futureLimit)
      }

      loadTasks()
    } catch (error) {
      console.log('Error generating recurring tasks:', error.message)
    }
  }

  async function generateInstancesForTask(parentTask, startDate, endDate) {
    const pattern = parentTask.recurrence_pattern
    if (!pattern || !parentTask.next_due_date) return

    let currentDate = new Date(parentTask.next_due_date)
    const instances = []

    while (currentDate <= endDate) {
      const { data: existing } = await supabase
        .from('tasks')
        .select('id')
        .eq('parent_task_id', parentTask.id)
        .eq('due_date', currentDate.toISOString())
        .single()

      if (!existing) {
        instances.push({
          title: parentTask.title,
          description: parentTask.description,
          due_date: currentDate.toISOString(),
          priority: parentTask.priority,
          status: 'pending',
          is_recurring: false,
          parent_task_id: parentTask.id
        })
      }

      currentDate = getNextOccurrence(currentDate, pattern)
      if (!currentDate) break
    }

    if (instances.length > 0) {
      await supabase.from('tasks').insert(instances)
      
      const lastInstanceDate = instances[instances.length - 1].due_date
      const nextAfterLast = getNextOccurrence(new Date(lastInstanceDate), pattern)
      if (nextAfterLast) {
        await supabase
          .from('tasks')
          .update({ next_due_date: nextAfterLast.toISOString() })
          .eq('id', parentTask.id)
      }
    }
  }

  function getNextOccurrence(currentDate, pattern) {
    const next = new Date(currentDate)
    
    switch (pattern.type) {
      case 'daily':
        next.setDate(next.getDate() + pattern.interval)
        return next

      case 'weekly':
        if (pattern.days && pattern.days.length > 0) {
          const currentDay = next.getDay()
          const sortedDays = [...pattern.days].sort((a, b) => a - b)
          
          let nextDay = sortedDays.find(day => day > currentDay)
          if (!nextDay) {
            nextDay = sortedDays[0]
            next.setDate(next.getDate() + (7 - currentDay + nextDay))
          } else {
            next.setDate(next.getDate() + (nextDay - currentDay))
          }
        } else {
          next.setDate(next.getDate() + (7 * pattern.interval))
        }
        return next

      case 'monthly':
        next.setMonth(next.getMonth() + pattern.interval)
        if (pattern.day_of_month) {
          next.setDate(pattern.day_of_month)
        }
        return next

      default:
        return null
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
        is_recurring: isRecurring
      }

      if (newDueDate) {
        taskData.due_date = new Date(newDueDate).toISOString()
        
        if (isRecurring) {
          taskData.next_due_date = new Date(newDueDate).toISOString()
          taskData.recurrence_pattern = createRecurrencePattern()
        }
      }

      const { data, error } = await supabase
        .from('tasks')
        .insert([taskData])
        .select()

      if (error) throw error
      
      if (isRecurring && data[0]) {
        const now = new Date()
        const futureLimit = new Date()
        futureLimit.setDate(futureLimit.getDate() + 60)
        await generateInstancesForTask(data[0], now, futureLimit)
      }
      
      await loadTasks()
      resetForm()
    } catch (error) {
      alert('Error adding task: ' + error.message)
    }
  }

  function createRecurrencePattern() {
    const pattern = {
      type: recurrenceType,
      interval: recurrenceInterval
    }

    if (recurrenceType === 'weekly' && weeklyDays.length > 0) {
      pattern.days = weeklyDays
    } else if (recurrenceType === 'monthly') {
      pattern.day_of_month = monthlyDay
    }

    return pattern
  }

  function resetForm() {
    setNewTask('')
    setNewDescription('')
    setNewDueDate('')
    setNewPriority(1)
    setIsRecurring(false)
    setRecurrenceType('weekly')
    setRecurrenceInterval(1)
    setWeeklyDays([])
    setMonthlyDay(1)
  }

  async function toggleTask(taskId, currentStatus) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId)

      if (error) throw error

      setTasks(tasks.map(task => 
        task.id === taskId 
          ? { ...task, status: newStatus }
          : task
      ))
    } catch (error) {
      alert('Error updating task: ' + error.message)
    }
  }

  async function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId)
    
    if (task.is_recurring && !task.parent_task_id) {
      if (!confirm('This will delete the recurring task and all its future instances. Are you sure?')) {
        return
      }
    }

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

  function getRecurrenceText(pattern) {
    if (!pattern) return ''
    
    switch (pattern.type) {
      case 'daily':
        return pattern.interval === 1 ? 'Daily' : `Every ${pattern.interval} days`
      case 'weekly':
        if (pattern.days && pattern.days.length > 0) {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const days = pattern.days.map(d => dayNames[d]).join(', ')
          return `Weekly on ${days}`
        }
        return pattern.interval === 1 ? 'Weekly' : `Every ${pattern.interval} weeks`
      case 'monthly':
        return pattern.interval === 1 ? 'Monthly' : `Every ${pattern.interval} months`
      default:
        return 'Recurring'
    }
  }

  function toggleWeeklyDay(day) {
    if (weeklyDays.includes(day)) {
      setWeeklyDays(weeklyDays.filter(d => d !== day))
    } else {
      setWeeklyDays([...weeklyDays, day].sort())
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading your tasks...</div>
      </div>
    )
  }

  const recurringTasks = tasks.filter(t => t.is_recurring && !t.parent_task_id)
  const regularTasks = tasks.filter(t => !t.is_recurring || t.parent_task_id)

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Task Manager</h1>
            <p className="text-sm text-gray-600">Stay organized and never miss important tasks</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              title="Notification Settings"
            >
              <Settings size={24} />
            </button>
          </div>
        </div>
        
        {/* Add new task form */}
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

            {/* Recurring task options */}
            <div className="border-t pt-4">
              <label className="flex items-center mb-3">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="mr-2"
                />
                <Repeat size={16} className="mr-1" />
                Make this a recurring task
              </label>

              {isRecurring && (
                <div className="space-y-3 ml-6">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Repeat
                      </label>
                      <select
                        value={recurrenceType}
                        onChange={(e) => setRecurrenceType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Every
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={recurrenceInterval}
                        onChange={(e) => setRecurrenceInterval(parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {recurrenceType === 'weekly' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        On these days:
                      </label>
                      <div className="flex gap-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleWeeklyDay(index)}
                            className={`px-3 py-1 text-sm rounded ${
                              weeklyDays.includes(index)
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {recurrenceType === 'monthly' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        On day of month:
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={monthlyDay}
                        onChange={(e) => setMonthlyDay(parseInt(e.target.value))}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <button
              onClick={addTask}
              disabled={!newTask.trim() || (isRecurring && !newDueDate)}
              className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Add Task
            </button>
          </div>
        </div>

        {/* Recurring Tasks Section */}
        {recurringTasks.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Repeat size={20} />
              Recurring Tasks
            </h2>
            <div className="space-y-2">
              {recurringTasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-blue-50 rounded-lg p-3 border border-blue-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{task.title}</div>
                      <div className="text-sm text-gray-600">
                        {getRecurrenceText(task.recurrence_pattern)}
                        {task.next_due_date && (
                          <span className="ml-2">
                            • Next: {formatDate(task.next_due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Delete recurring task"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Regular Tasks */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {recurringTasks.length > 0 ? 'Your Tasks' : 'Tasks'}
          </h2>
          
          {regularTasks.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
              No tasks yet. Add one above to get started!
            </div>
          ) : (
            regularTasks.map((task) => (
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
                      
                      {task.parent_task_id && (
                        <Copy size={14} className="text-blue-500" title="Recurring task instance" />
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
                  </div>
                  
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Settings Modal */}
        <NotificationSettings 
          isOpen={showSettings} 
          onClose={() => setShowSettings(false)} 
        />
      </div>
    </div>
  )
}
