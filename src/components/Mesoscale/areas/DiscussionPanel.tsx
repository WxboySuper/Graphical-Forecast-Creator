/** Discussion tab: free text explaining the areas, saved with the product. */
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectMesoscaleState, setMesoscaleDiscussion } from '../../../store/mesoscaleSlice';
import { MAX_MESOSCALE_DISCUSSION_LENGTH } from '../../../utils/mesoscaleValidationLimits';

export const DiscussionPanel: React.FC = () => {
  const dispatch = useDispatch();
  const { discussion } = useSelector(selectMesoscaleState);
  return (
    <section className="mesoscale-section" aria-label="Discussion">
      <h2 className="mesoscale-section__title">Discussion</h2>
      <label className="mesoscale-form__field">
        <span>What are you seeing, and why are these areas drawn?</span>
        <textarea
          className="mesoscale-discussion"
          value={discussion}
          maxLength={MAX_MESOSCALE_DISCUSSION_LENGTH}
          rows={12}
          onChange={(event) => dispatch(setMesoscaleDiscussion(event.target.value))}
        />
      </label>
      <p className="mesoscale-discussion__count">{discussion.length.toLocaleString()} / {MAX_MESOSCALE_DISCUSSION_LENGTH.toLocaleString()}</p>
    </section>
  );
};
