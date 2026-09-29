import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { setActivityPath, setActivityUser } from '../utils/activityTracker'

/** Feeds the current route and logged-in user to the activity tracker. Renders nothing. */
const ActivityTracker = () => {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const userId = user?._id || user?.id || null

  useEffect(() => {
    setActivityPath(pathname)
  }, [pathname])

  useEffect(() => {
    setActivityUser(userId)
  }, [userId])

  return null
}

export default ActivityTracker
