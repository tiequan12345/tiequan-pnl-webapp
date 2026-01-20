import { Suspense } from 'react';
import PnlPageView from './PnlPageView';

export default function PnlPage() {
  return (
    <Suspense fallback={<div>Loading PNL...</div>}>
      <PnlPageView />
    </Suspense>
  );
}
