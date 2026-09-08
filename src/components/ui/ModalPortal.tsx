/**
 * Modal portal. Mounts modal content at document.body and safely returns no output
 * during server-side rendering where document is unavailable.
 */
import React from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, document.body);
};

export default ModalPortal;