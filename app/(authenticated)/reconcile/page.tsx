import { Card } from '../_components/ui/Card';
import { ReconcileView } from './ReconcileView';

export default function ReconcilePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">Reconcile</h2>
          <p className="text-sm text-zinc-400">Resolve transfer legs with mismatches, missing pairs, or fee adjustments.</p>
        </div>
      </div>

      <Card className="p-0 rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <ReconcileView />
      </Card>
    </div>
  );
}
