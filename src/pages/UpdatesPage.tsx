import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { v16Update, type UpdateScreenshot } from '../content/updates/v1.6';
import './UpdatesPage.css';

/** Renders a release screenshot when the asset exists under public/updates. */
function UpdateScreenshotFigure({ shot }: { shot: UpdateScreenshot }) {
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return null;
  }

  return (
    <figure className="updates-page__figure">
      <img src={shot.src} alt={shot.alt} loading="lazy" onError={() => setVisible(false)} />
      {shot.caption ? <figcaption>{shot.caption}</figcaption> : null}
    </figure>
  );
}

/** Public What's New page for the current major release. */
export const UpdatesPage: React.FC = () => (
  <div className="updates-page">
    <div className="updates-page__inner">
      <p className="updates-page__eyebrow">What&apos;s new · v{v16Update.version}</p>
      <h1>{v16Update.title}</h1>
      <p className="updates-page__summary">{v16Update.summary}</p>

      {v16Update.sections.map((section) => (
        <section key={section.title} className="updates-page__section">
          <h2>{section.title}</h2>
          <p>{section.body}</p>
          {section.screenshots?.length ? (
            <div className="updates-page__shots">
              {section.screenshots.map((shot) => (
                <UpdateScreenshotFigure key={shot.src} shot={shot} />
              ))}
            </div>
          ) : null}
        </section>
      ))}

      <section className="updates-page__improvements" aria-labelledby="updates-improvements-heading">
        <h2 id="updates-improvements-heading">Also improved</h2>
        <ul>
          {v16Update.improvements.map((item, index) => (
            <li key={`v16-improvement-${index}`}>{item}</li>
          ))}
        </ul>
      </section>

      <Link className="updates-page__back" to="/">
        Back to home
      </Link>
    </div>
  </div>
);

export default UpdatesPage;
