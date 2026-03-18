import React from 'react'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { store } from './store/store'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import AppThemeConfig from './components/AppThemeConfig'
import AppRouter from './router/AppRouter'

function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <ThemeProvider>
          <AppThemeConfig>
            <AuthProvider>
              <AppRouter />
            </AuthProvider>
          </AppThemeConfig>
        </ThemeProvider>
      </BrowserRouter>
    </Provider>
  )
}

export default App
