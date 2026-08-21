import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Today from './screens/Today'
import AddProblem from './screens/AddProblem'
import Browse from './screens/Browse'
import Settings from './screens/Settings'
import Stats from './screens/Stats'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<Today />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/add" element={<AddProblem />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}
