# LAYP 4.2.1 source ZIP

Source commit: 1d5e953571a814486c41b84198b34e94c270e93c on main.

Download LAYP-updated-source-4.2.1.zip using Download raw file, or append ?raw=true to its GitHub file URL. Extract it, then run npm ci inside react-native-layp.

This source-only archive exactly matches the commit above, excluding dependencies, generated build outputs, and app binaries. SHA256SUMS contains its checksum.

Changes:
- Spending widget search results open a prefilled expense form. Tap a result, review it, then Save expense to record a new expense for today's local date. Account, budget category, label, name, and amount are preserved. Cancel leaves history unchanged; balance checks prevent overspending. The widget updates immediately; the app absorbs queued expenses when opened or resumed.
- The account widget shows Total budget across all accounts, including pending widget income/spending. Account filters affect individual cards; Hide/Show masks the total and cards. Missing balances show Sync needed. The in-app budget preview includes the total.

Validation: all 26 app test suites / 224 tests and all nine native JUnit/Robolectric tests passed. Native release Kotlin compiled. The native tests exercise actual search-tap/form-save and cancel flows, balance checks, and totals before/after queued entries are absorbed. Real launcher rendering still requires phone testing.

Native test instructions and the Expo 51 Jetifier compatibility flag are documented in the repository README.
