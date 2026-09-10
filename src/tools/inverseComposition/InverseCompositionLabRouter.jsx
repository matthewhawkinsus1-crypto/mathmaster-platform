import React from 'react';
import InverseCompositionLab from './InverseCompositionLab';
import InverseDerivationLab from './InverseDerivationLab';

export default function InverseCompositionLabRouter(props) {
  if (props?.questionData?.mode === 'deriveInverse') {
    return <InverseDerivationLab {...props} />;
  }
  return <InverseCompositionLab {...props} />;
}
