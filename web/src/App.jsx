import { Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import FeaturePlaceholderPage from './pages/FeaturePlaceholderPage';
import EndToEndPage from './pages/EndToEndPage';
import StudentIntakePage from './pages/StudentIntakePage';
import StudentRoadmapsPage from './pages/StudentRoadmapsPage';
import StudentRoadmapDetailPage from './pages/StudentRoadmapDetailPage';
import StudentIdeasPage from './pages/StudentIdeasPage';
import StudentChatPage from './pages/StudentChatPage';
import StudentConversationPage from './pages/StudentConversationPage';
import AgentWorkflowPage from './pages/AgentWorkflowPage';
import ResourceHubPage from './pages/ResourceHubPage';
import LearnPage from './pages/LearnPage';
import VivaHomePage from './pages/VivaHomePage';
import VivaSetupPage from './pages/VivaSetupPage';
import VivaRoomPage from './pages/VivaRoomPage';
import GroupsPage from './pages/GroupsPage';
import GroupWorkspacePage from './pages/GroupWorkspacePage';
import JoinGroupPage from './pages/JoinGroupPage';
import CommunityPage from './pages/CommunityPage';
import ProfilePage from './pages/ProfilePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ContactAdminPage from './pages/ContactAdminPage';
import SiteLayout from './components/SiteLayout';
import ScrollToTop from './components/ScrollToTop';
import AdminApp from './admin/AdminApp';
import AdminLogin from './admin/AdminLogin';
import { RequireAuth, RequireRole } from './auth/RouteGuards';

export default function App() {
  return (
    <>
    <ScrollToTop />
    <Routes>
      {/* Pages that manage their own chrome (dark hero navbar / split auth layout). */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/contact-admin" element={<ContactAdminPage />} />

      {/* Admin console: a separate link with its own sign-in and layout. Manages the website and the mobile app. */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/*" element={<AdminApp />} />

      {/* App pages share the light navbar + footer via SiteLayout. */}
      <Route element={<SiteLayout />}>
        <Route path="/demo" element={<EndToEndPage />} />
        {/* Open to logged-out visitors: full Learn and Resources (downloads need a login) and a read-only community. */}
        <Route path="/resources" element={<ResourceHubPage />} />
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/community/*" element={<CommunityPage />} />
        {/* Invitation link landing page: open to everyone; logged-out visitors sign up / log in first and come back here */}
        <Route path="/join/:token" element={<JoinGroupPage />} />
        <Route element={<RequireAuth />}>
          {/* Student profile: details, picture, progress, activity, notifications */}
          <Route path="/profile" element={<ProfilePage />} />
          <Route element={<RequireRole role="Student" />}>
            {/* Intake: start a brand-new roadmap */}
            <Route path="/student" element={<StudentIntakePage />} />
            {/* List: all of this student's roadmap requests */}
            <Route path="/student/roadmaps" element={<StudentRoadmapsPage />} />
            {/* Detail: one specific roadmap request, by id */}
            {/* Idea suggestions for a draft request (Path A) */}
            <Route path="/student/roadmaps/:id/ideas" element={<StudentIdeasPage />} />
            {/* Mentor chat — refine the idea before planning */}
            <Route path="/student/roadmaps/:id/chat" element={<StudentChatPage />} />
            {/* View / continue a saved conversation (separate from generation) */}
            <Route path="/student/roadmaps/:id/conversation" element={<StudentConversationPage />} />
            <Route path="/student/roadmaps/:id" element={<StudentRoadmapDetailPage />} />
            {/* AI Workflow: the four agents' execution history for one roadmap */}
            <Route path="/student/roadmaps/:id/workflow" element={<AgentWorkflowPage />} />
            {/* AI Mock Viva: home, project-details form, live viva room + report */}
            <Route path="/student/viva" element={<VivaHomePage />} />
            <Route path="/student/viva/new" element={<VivaSetupPage />} />
            <Route path="/student/viva/:id" element={<VivaRoomPage />} />
            {/* Project groups: list, workspace (sprint board, this week, chat, roadmap, team) */}
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/groups/:id" element={<GroupWorkspacePage />} />
            <Route path="/planning" element={<FeaturePlaceholderPage eyebrow="Planning workspace" title="Build your roadmap" description="The planning workspace will turn an approved intake into milestones, dates, and attached resources." />} />
          </Route>
        </Route>
      </Route>
    </Routes>
    </>
  );
}
