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
import AtomScmPage from './pages/atom/AtomScmPage'
import AtomScmVisualPage from './pages/atom/AtomScmVisualPage'
import ChangeManagementPage from './pages/change/ChangeManagementPage'
import AlarmCenterPage from './pages/alarms/AlarmCenterPage'
import CollaborationWorkspacePage from './pages/collaboration/CollaborationWorkspacePage'
import SowControlCenterPage from './pages/ccc/SowControlCenterPage'
import RccDamSowPage from './pages/ccc/RccDamSowPage'

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
        <Route path="/atoms/scm" element={<AtomScmPage />} />
        <Route path="/atoms/scm/visual" element={<AtomScmVisualPage />} />
        <Route path="/contracts/:id/atoms" element={<AtomManagerPage />} />
        <Route path="/atoms/deployments" element={<AtomDeploymentsPage />} />
        <Route path="/atoms/catalog/:slug" element={<AtomDetailPage />} />
        <Route path="/atoms/catalog/:slug/experience" element={<AtomDetailExperiencePage />} />
        <Route path="/change-management" element={<ChangeManagementPage />} />
        <Route path="/alarms" element={<AlarmCenterPage />} />
        <Route path="/collaboration" element={<CollaborationWorkspacePage />} />
        <Route path="/projects/:projectId/contracts/:contractId/sow" element={<SowControlCenterPage />} />
        <Route path="/projects/:projectId/contracts/:contractId/rcc-dam" element={<RccDamSowPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRouter
