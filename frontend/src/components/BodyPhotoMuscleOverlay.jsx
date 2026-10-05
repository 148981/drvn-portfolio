/**
 * BodyPhotoMuscleOverlay.jsx — v3
 * Pure proxy + passes buildCompositionForPhoto for compare mode.
 */

import React from 'react';
import AntigravityMuscleMap from './AntigravityMuscleMap';

const BodyPhotoMuscleOverlay = ({
  userId,
  composition,
  prevComposition,
  prevDate,
  bodyPhotos,
  activePhotoIndex,
  onPhotoIndexChange,
  onOpenInBodyForm,
  onPhotoAdd,
  onPhotoDelete,
  recoveryData,
  buildCompositionForPhoto,
}) => {
  return (
    <AntigravityMuscleMap
      composition={composition}
      prevComposition={prevComposition}
      prevDate={prevDate}
      bodyPhotos={bodyPhotos}
      activePhotoIndex={activePhotoIndex}
      onPhotoIndexChange={onPhotoIndexChange}
      onOpenInBodyForm={onOpenInBodyForm}
      onPhotoAdd={onPhotoAdd}
      onPhotoDelete={onPhotoDelete}
      recoveryData={recoveryData || {}}
      buildCompositionForPhoto={buildCompositionForPhoto}
    />
  );
};

export default BodyPhotoMuscleOverlay;
