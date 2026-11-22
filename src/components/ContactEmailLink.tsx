/**
 * Contact email link. Renders the designated GFC contact address as a mailto
 * link so every page that offers help points at the same place.
 */
import React from 'react';
import { CONTACT_EMAIL, CONTACT_MAILTO } from '../config/contact';

interface ContactEmailLinkProps {
  className?: string;
}

/** Link to the GFC contact mailbox, labeled with the address itself. */
const ContactEmailLink: React.FC<ContactEmailLinkProps> = ({ className }) => (
  <a href={CONTACT_MAILTO} className={className}>{CONTACT_EMAIL}</a>
);

export default ContactEmailLink;
