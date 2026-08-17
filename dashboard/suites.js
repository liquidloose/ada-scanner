import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultPackageJson = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'package.json'
);

export function loadSuites(packageJsonPath = defaultPackageJson) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return Object.entries(pkg.scripts || {})
        .filter(([name]) => name.startsWith('test:'))
        .map(([script, command]) => {
            const id = script.slice('test:'.length);
            const testFileMatch = String(command).match(/playwright test\s+(\S+)/);
            return {
                id,
                script,
                command: String(command),
                testFile: testFileMatch ? testFileMatch[1] : null,
                label: id,
            };
        });
}

export const suites = loadSuites();
