import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import App from './pages/App'
import ScheduleProjectPage from './pages/schedule/ScheduleProjectPage'
import ContractSchedulePage from './pages/schedule/ContractSchedulePage'
import SowSchedulePage from './pages/schedule/SowSchedulePage'
import ProcessSchedulePage from './pages/schedule/ProcessSchedulePage'
import FinancialViewPage from './pages/financial/FinancialViewPage'
import AtomManagerPage from './pages/atom/AtomManagerPage'
import AtomSchedulingPage from './pages/atom/AtomSchedulingPage'
import AtomCostPage from './pages/atom/AtomCostPage'
import AtomDeploymentsPage from './pages/atom/AtomDeploymentsPage'
import AtomDetailPage from './pages/atom/AtomDetailPage'
import AtomDetailExperiencePage from './pages/atom/AtomDetailExperiencePage'
import ChangeManagementPage from './pages/change/ChangeManagementPage'
import AlarmCenterPage from './pages/alarms/AlarmCenterPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/schedule" element={<ScheduleProjectPage />} />
        <Route path="/contracts/:id/schedule" element={<ContractSchedulePage />} />
        <Route path="/sow/:id/schedule" element={<SowSchedulePage />} />
        <Route path="/process/:id/schedule" element={<ProcessSchedulePage />} />
        <Route path="/financial" element={<FinancialViewPage />} />
        <Route path="/contracts/:id/financial" element={<FinancialViewPage />} />
        <Route path="/atoms" element={<AtomManagerPage />} />
        <Route path="/atoms/scheduling" element={<AtomSchedulingPage />} />
        <Route path="/atoms/cost" element={<AtomCostPage />} />
        <Route path="/contracts/:id/atoms" element={<AtomManagerPage />} />
        <Route path="/atoms/deployments" element={<AtomDeploymentsPage />} />
        <Route path="/atoms/catalog/:slug" element={<AtomDetailPage />} />
        <Route path="/atoms/catalog/:slug/experience" element={<AtomDetailExperiencePage />} />
        <Route path="/change-management" element={<ChangeManagementPage />} />
        <Route path="/alarms" element={<AlarmCenterPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRouter
