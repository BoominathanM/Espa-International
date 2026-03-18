import { configureStore } from '@reduxjs/toolkit'
import { apiSlice } from './api/apiSlice'
import './api/customerApi'
import './api/systemLogsApi'

export const store = configureStore({
  reducer: {
    [apiSlice.reducerPath]: apiSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(apiSlice.middleware),
})
