import React from 'react';
import { Bot } from 'lucide-react';

/** Maintainer note kept at the bottom of the home page without dominating the product message. */
const AIDisclosure: React.FC = () => (
  <div className="home-disclosure">
    <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
    <p className="leading-relaxed">
      <span className="font-medium text-foreground">AI Development Disclosure:</span>{' '}
      AI was used in the development of this project. All code has been reviewed by the maintainer
      (Alex / WeatherboySuper) to ensure quality and correctness; however, bugs or issues may still
      be present. If you encounter a problem, please report it via{' '}
      <a
        href="https://github.com/WxboySuper/Graphical-Forecast-Creator/issues"
        target="_blank"
        rel="noopener noreferrer"
        className="underline transition-colors hover:text-foreground"
      >
        GitHub Issues
      </a>
      {' '}or the{' '}
      <a
        href="https://discord.gg/SGk37rg8sz"
        target="_blank"
        rel="noopener noreferrer"
        className="underline transition-colors hover:text-foreground"
      >
        GFC Support Discord
      </a>
      .
    </p>
  </div>
);

export default AIDisclosure;
