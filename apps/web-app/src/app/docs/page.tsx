import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import SwaggerDoc from './swagger-ui';

export default async function ApiDocsPage() {
  const filePath = path.join(process.cwd(), 'docs', 'swagger.yaml');
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const spec = YAML.parse(fileContents);

  return (
    <section className="container">
      <SwaggerDoc spec={spec} />
    </section>
  );
}
