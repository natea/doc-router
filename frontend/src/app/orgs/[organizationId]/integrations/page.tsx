'use client'

import Integrations from '@/components/Integrations';
import IntegrationCreate from '@/components/IntegrationCreate';
import { IntegrationProvider } from '@/contexts/IntegrationContext';
import { useSearchParams, useRouter } from 'next/navigation';

export default function IntegrationsPage({ params }: { params: { organizationId: string } }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get('tab') || 'integrations';

  const handleTabChange = (newValue: string) => {
    router.push(`/orgs/${params.organizationId}/integrations?tab=${newValue}`);
  };

  return (
    <IntegrationProvider>
      <div className="p-4">
        <div className="border-b border-gray-200 mb-6">
          <div className="flex gap-8">
            <button
              onClick={() => handleTabChange('integrations')}
              className={`pb-4 px-1 relative font-semibold text-base ${
                tab === 'integrations'
                  ? 'text-blue-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Integrations
            </button>
            <button
              onClick={() => handleTabChange('integration-create')}
              className={`pb-4 px-1 relative font-semibold text-base ${
                tab === 'integration-create'
                  ? 'text-blue-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Add Integration
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto">
          <div role="tabpanel" hidden={tab !== 'integrations'}>
            {tab === 'integrations' && <Integrations organizationId={params.organizationId} />}
          </div>
          <div role="tabpanel" hidden={tab !== 'integration-create'}>
            {tab === 'integration-create' && <IntegrationCreate organizationId={params.organizationId} />}
          </div>
        </div>
      </div>
    </IntegrationProvider>
  );
}