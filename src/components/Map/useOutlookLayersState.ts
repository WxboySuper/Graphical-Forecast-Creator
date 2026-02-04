import React from 'react';
import { useDispatch } from 'react-redux';
import { OutlookType } from '../../types/outlooks';
import { removeFeature } from '../../store/forecastSlice';

export const useOutlookLayersState = () => {
  const dispatch = useDispatch();
  const [deleteModal, setDeleteModal] = React.useState<{
    isOpen: boolean;
    outlookType?: OutlookType;
    probability?: string;
    featureId?: string;
  }>({ isOpen: false });

  const handleRequestDelete = React.useCallback((ot: OutlookType, prob: string, fid: string) => {
    setDeleteModal({
      isOpen: true,
      outlookType: ot,
      probability: prob,
      featureId: fid
    });
  }, []);

  const hasValidDeleteModal = React.useCallback(() => {
    const { outlookType, probability, featureId } = deleteModal;
    return !!(outlookType && probability && featureId);
  }, [deleteModal]);

  const handleConfirmDelete = React.useCallback(() => {
    if (hasValidDeleteModal()) {
      const { outlookType, probability, featureId } = deleteModal;
      dispatch(removeFeature({
        outlookType,
        probability,
        featureId
      }));
    }
    setDeleteModal({ isOpen: false });
  }, [dispatch, deleteModal, hasValidDeleteModal]);

  const handleCancelDelete = React.useCallback(() => {
    setDeleteModal({ isOpen: false });
  }, []);

  return {
    deleteModal,
    handleRequestDelete,
    handleConfirmDelete,
    handleCancelDelete
  };
};
