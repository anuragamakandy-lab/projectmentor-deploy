import AuthShell from '../components/AuthShell';
import { ContactAdminForm } from '../components/AuthBits';
import { useAuth } from '../auth/AuthContext';

/** Public "Contact the admins" page (linked from the account-deactivated email and the footer). */
export default function ContactAdminPage() {
  const { user } = useAuth();
  return (
    <AuthShell title="Talk to the ProjectMentor team." points={['Account and login problems', 'Questions about your roadmap', 'Reporting a post or a bug']}>
      <section className="auth-card auth-card-wide rise">
        <p className="eyebrow">Support</p>
        <h1>Contact the admins</h1>
        <p className="auth-intro">Your message goes straight to the ProjectMentor admins. They reply by email.</p>
        <ContactAdminForm name={user?.fullName ?? ''} email={user?.email ?? ''} />
      </section>
    </AuthShell>
  );
}
