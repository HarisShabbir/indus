import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import App from './pages/App'
import ScheduleProjectPage from './pages/schedule/ScheduleProjectPage'
import ContractSchedulePage from './pages/schedule/ContractSchedulePage'
import SowSchedulePage from './pages/schedule/SowSchedulePage'
import ProcessSchedulePage from './pages/schedule/ProcessSchedulePage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/schedule" element={<ScheduleProjectPage />} />
        <Route path="/contracts/:id/schedule" element={<ContractSchedulePage />} />
        <Route path="/sow/:id/schedule" element={<SowSchedulePage />} />
        <Route path="/process/:id/schedule" element={<ProcessSchedulePage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRouter
