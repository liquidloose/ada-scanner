export type DashboardTab = 'scanner' | 'saved';

export type SiteNavItem = {
    id: string;
    label: string;
    tab: DashboardTab;
};

export const siteNavItems: SiteNavItem[] = [
    { id: 'sites-panel', label: 'Sites', tab: 'scanner' },
    { id: 'launch-form', label: 'Run', tab: 'scanner' },
    { id: 'output-panel', label: 'Output', tab: 'scanner' },
    { id: 'report-panel', label: 'Playwright', tab: 'scanner' },
    { id: 'allure-panel', label: 'Allure', tab: 'scanner' },
    { id: 'spreadsheets-panel', label: 'Spreadsheets', tab: 'scanner' },
    { id: 'saved-scans-panel', label: 'Saved', tab: 'saved' },
];

type SiteNavProps = {
    activeId: string;
    onNavigate: (item: SiteNavItem) => void;
};

export function SiteNav({ activeId, onNavigate }: SiteNavProps) {
    return (
        <nav aria-label="Page sections">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {siteNavItems.map((item) => {
                    const current = item.id === activeId;
                    return (
                        <li key={item.id}>
                            <a
                                href={`#${item.id}`}
                                aria-current={current ? 'location' : undefined}
                                className={`text-sm ${
                                    current
                                        ? 'font-medium text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                onClick={(event) => {
                                    event.preventDefault();
                                    onNavigate(item);
                                }}
                            >
                                {item.label}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
