import './styles.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import AppRouter from './AppRouter'

createRoot(document.getElementById('root')!).render(<AppRouter />)
