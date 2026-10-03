import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';

/** Shared chrome for the app pages: light navbar, the soft hero background, content, footer. */
export default function SiteLayout() {
  return (
    <div className="app-shell">
      <div className="page-hero-bg" aria-hidden="true" />
      <Navbar />
      <Outlet />
      <Footer />
    </div>
  );
}
