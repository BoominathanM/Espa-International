import React, { useEffect, useState } from 'react'
import { Alert } from 'antd'
import { useGetCustomerFeedbackCallsQuery } from '../../store/api/customerApi'
import FeedbackCallList, { feedbackPollInterval } from '../../components/FeedbackCalls/FeedbackCallList'

/**
 * A customer's ZenXAI feedback calls and responses (placed from Customers or from any of their
 * appointments). Used in the Customer Details modal and the Customer Timeline. Refreshes itself
 * every 10 s while a call is still running.
 */
const CustomerFeedbackCalls = ({ customerId }) => {
  const [poll, setPoll] = useState(0)
  const { data, isLoading, isFetching, isError, refetch } = useGetCustomerFeedbackCallsQuery(customerId, {
    skip: !customerId,
    pollingInterval: poll,
    refetchOnMountOrArgChange: 30,
  })

  useEffect(() => {
    setPoll(feedbackPollInterval(data?.calls))
  }, [data])

  if (isError && !data) {
    return <Alert type="error" showIcon message="Could not load feedback calls" />
  }
  return (
    <FeedbackCallList
      calls={data?.calls}
      loading={isLoading}
      fetching={isFetching}
      onRefresh={refetch}
      emptyText={'No feedback calls yet — use "Send feedback call" to ask this customer for feedback.'}
    />
  )
}

export default CustomerFeedbackCalls
