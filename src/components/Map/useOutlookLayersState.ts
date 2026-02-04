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

  const handleConfirmDelete = React.useCallback(() => {
    if (deleteModal.outlookType && deleteModal.probability && deleteModal.featureId) {
      dispatch(removeFeature({
        outlookType: deleteModal.outlookType,
        probability: deleteModal.probability,
        featureId: deleteModal.featureId
      }));
    }
    setDeleteModal({ isOpen: false });
  }, [dispatch, deleteModal]);

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
