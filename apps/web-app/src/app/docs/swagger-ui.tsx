'use client';

import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function SwaggerDoc({ spec }: { spec: Record<string, unknown> }) {
  return (
    <div className="min-h-dvh bg-white text-[#3b4151] scheme-light">
      <SwaggerUI spec={spec} />
    </div>
  );
}
