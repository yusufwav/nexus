const fs = require("fs");

const L = (...lines) => lines.join("\n");

function sub(text, from, to, label) {
  const a = text.includes(from) ? from : from.replace(/\n/g, "\r\n");
  const bb = text.includes(to) ? to : to.replace(/\n/g, "\r\n");
  if (!text.includes(a)) {
    console.log(`MISS: ${label}`);
    return text;
  }
  console.log(`ok: ${label}`);
  return text.replace(a, bb);
}

const f = "src/app/(tabs)/tutor.tsx";
let b = fs.readFileSync(f, "utf8");

/* ------------------------------------------------------------------ *
 * the import
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L('import { listModels, streamChat, type ChatMessage, type ModelInfo } from "@/lib/llm";'),
  L(
    'import { listModels, streamChat, type ChatMessage, type ModelInfo } from "@/lib/llm";',
    'import { modelOption, modelValue, splitModelValue } from "@/lib/model-picker";',
  ),
  "the import",
);

/* ------------------------------------------------------------------ *
 * the state
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "  const [provider, setProvider] = useState<Provider | null>(null);",
    "  const [apiKey, setApiKey] = useState<string | null>(null);",
    "  const [model, setModel] = useState<string>(\"\");",
    "  const [models, setModels] = useState<ReadonlyArray<ModelInfo>>([]);",
  ),
  L(
    "  const [provider, setProvider] = useState<Provider | null>(null);",
    "  const [apiKey, setApiKey] = useState<string | null>(null);",
    "  const [model, setModel] = useState<string>(\"\");",
    "  /** Every provider the reader has added, not only the active one. */",
    "  const [providers, setProviders] = useState<ReadonlyArray<Provider>>([]);",
    "  /** The models of each provider, fetched once and kept. */",
    "  const [modelsByProvider, setModelsByProvider] = useState<",
    "    Readonly<Record<string, ReadonlyArray<ModelInfo>>>",
    "  >({});",
    "  /** The providers whose models are being fetched right now. */",
    "  const [loadingProviders, setLoadingProviders] = useState<ReadonlyArray<string>>([]);",
  ),
  "the state",
);

/* ------------------------------------------------------------------ *
 * the ref that remembers what has been asked for
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "  const seeded = useRef(false);",
  ),
  L(
    "  const seeded = useRef(false);",
    "  /** The providers whose models have already been asked for. */",
    "  const asked = useRef<ReadonlyArray<string>>([]);",
  ),
  "the asked-for ref",
);

/* ------------------------------------------------------------------ *
 * loadProvider — the whole list, and a clean slate of models
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "  const loadProvider = useCallback(async () => {",
    "    const all = await listProviders();",
    "    const activeId = await readActiveProviderId();",
    "    const chosen = all.find((p) => p.id === activeId) ?? all[0] ?? null;",
    "    setProvider(chosen);",
    "    if (chosen === null) {",
    "      setApiKey(null);",
    "      setModel(\"\");",
    "      setModels([]);",
    "      return;",
    "    }",
  ),
  L(
    "  const loadProvider = useCallback(async () => {",
    "    const all = await listProviders();",
    "    const activeId = await readActiveProviderId();",
    "    const chosen = all.find((p) => p.id === activeId) ?? all[0] ?? null;",
    "    setProviders(all);",
    "    setProvider(chosen);",
    "    // A provider's catalogue can change, and a reader who has just been in",
    "    // the settings may have added one, so the models are asked for again.",
    "    setModelsByProvider({});",
    "    asked.current = [];",
    "    if (chosen === null) {",
    "      setApiKey(null);",
    "      setModel(\"\");",
    "      return;",
    "    }",
  ),
  "loadProvider",
);

/* ------------------------------------------------------------------ *
 * the models, per provider
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "  /* ---- the models, from the provider's own list ---- */",
    "  const loadModels = useCallback(async () => {",
    "    if (provider === null || apiKey === null) return;",
    "    try {",
    "      const list = await listModels(provider.baseUrl, apiKey);",
    "      setModels(list);",
    "    } catch {",
    "      // A provider that will not list its models is not a failure: the",
    "      // reader can still type one in the settings.",
    "      setModels([]);",
    "    }",
    "  }, [apiKey, provider]);",
    "",
    "  useEffect(() => {",
    "    if (provider === null) return;",
    "    void (async () => {",
    "      await loadModels();",
    "    })();",
    "  }, [loadModels, provider]);",
  ),
  L(
    "  /* ---- the models, from the provider's own list ---- */",
    "  /**",
    "   * A PROVIDER'S MODELS, FETCHED ONCE AND KEPT.",
    "   *",
    "   * The reader can open any provider's models from the picker, so the list",
    "   * is fetched per provider and kept: a provider is asked once, and the",
    "   * answer is remembered for as long as the screen is mounted.",
    "   */",
    "  const loadProviderModels = useCallback(",
    "    async (providerId: string): Promise<void> => {",
    "      if (asked.current.includes(providerId)) return;",
    "      const target = providers.find((p) => p.id === providerId);",
    "      if (target === undefined) return;",
    "      asked.current = [...asked.current, providerId];",
    "      setLoadingProviders((prev) =>",
    "        prev.includes(providerId) ? prev : [...prev, providerId],",
    "      );",
    "      const withKey = await getProviderWithKey(providerId);",
    "      let list: ReadonlyArray<ModelInfo> = [];",
    "      if (withKey !== null) {",
    "        try {",
    "          list = await listModels(target.baseUrl, withKey.apiKey);",
    "        } catch {",
    "          // A provider that will not list its models is not a failure: the",
    "          // reader can still type one in the settings.",
    "          list = [];",
    "        }",
    "      }",
    "      setModelsByProvider((prev) => ({ ...prev, [providerId]: list }));",
    "      setLoadingProviders((prev) => prev.filter((id) => id !== providerId));",
    "    },",
    "    [providers],",
    "  );",
    "",
    "  useEffect(() => {",
    "    if (provider === null) return;",
    "    void (async () => {",
    "      await loadProviderModels(provider.id);",
    "    })();",
    "  }, [loadProviderModels, provider]);",
  ),
  "the per-provider models",
);

/* ------------------------------------------------------------------ *
 * choosing a model
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "  const chooseModel = useCallback(",
    "    (next: string) => {",
    "      setModel(next);",
    "      if (provider !== null) {",
    "        void writeModelChoice(provider.id, next);",
    "      }",
    "    },",
    "    [provider],",
    "  );",
  ),
  L(
    "  const chooseModel = useCallback(",
    "    (next: string) => {",
    "      const parsed = splitModelValue(next);",
    "      if (parsed === null) return;",
    "      if (provider !== null && provider.id === parsed.providerId) {",
    "        setModel(parsed.modelId);",
    "        void writeModelChoice(parsed.providerId, parsed.modelId);",
    "        return;",
    "      }",
    "      /*",
    "       * A MODEL FROM ANOTHER PROVIDER.",
    "       *",
    "       * That provider becomes the active one, because a model the reader has",
    "       * picked and the provider the tutor is talking to have to be the same",
    "       * one — otherwise the choice means nothing.",
    "       */",
    "      void (async () => {",
    "        await writeActiveProviderId(parsed.providerId);",
    "        await writeModelChoice(parsed.providerId, parsed.modelId);",
    "        await loadProvider();",
    "      })();",
    "    },",
    "    [loadProvider, provider],",
    "  );",
  ),
  "choosing a model",
);

/* ------------------------------------------------------------------ *
 * the groups, and the free ones
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "  const modelOptions = useMemo(",
    "    () =>",
    "      models.map((m) => ({",
    "        value: m.id,",
    "        label: m.label,",
    "        detail: m.free ? `${m.id}  \u00b7  free` : m.id,",
    "      })),",
    "    [models],",
    "  );",
  ),
  L(
    "  /**",
    "   * THE PROVIDERS, AND THEIR MODELS UNDER THEM.",
    "   *",
    "   * A group is a provider, and the models are under it. A provider that has",
    "   * not been opened yet has no models, so the group says how many it has",
    "   * rather than showing an empty list.",
    "   */",
    "  const modelGroups = useMemo(",
    "    () =>",
    "      providers.map((p) => {",
    "        const list = modelsByProvider[p.id];",
    "        const loading = loadingProviders.includes(p.id);",
    "        return {",
    "          id: p.id,",
    "          label: p.name,",
    "          detail: loading",
    "            ? \"loading\u2026\"",
    "            : list === undefined",
    "              ? undefined",
    "              : `${list.length} models`,",
    "          options: (list ?? []).map((m) => modelOption(p.id, m)),",
    "        };",
    "      }),",
    "    [loadingProviders, modelsByProvider, providers],",
    "  );",
    "",
    "  /**",
    "   * THE FREE MODELS, AS VALUES.",
    "   *",
    "   * The filter is on by default, because a provider that lists hundreds of",
    "   * models is a list nobody scrolls through, and the ones that cost nothing",
    "   * are usually the ones wanted.",
    "   */",
    "  const freeValues = useMemo(() => {",
    "    const set = new Set<string>();",
    "    for (const [providerId, list] of Object.entries(modelsByProvider)) {",
    "      for (const m of list) {",
    "        if (m.free === true) set.add(modelValue(providerId, m.id));",
    "      }",
    "    }",
    "    return set;",
    "  }, [modelsByProvider]);",
  ),
  "the groups and the free ones",
);

/* ------------------------------------------------------------------ *
 * the picker itself
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "              <Select",
    "                value={model.length > 0 ? model : null}",
    "                options={modelOptions}",
    "                onChange={chooseModel}",
    "                placeholder=\"choose a model\"",
    "                filter={{",
    "                  label: \"Free only\",",
    "                  active: freeOnly,",
    "                  onToggle: () => setFreeOnly((prev) => !prev),",
    "                  matches: (option) => {",
    "                    const found = models.find((m) => m.id === option.value);",
    "                    return found?.free === true;",
    "                  },",
    "                }}",
    "              />",
  ),
  L(
    "              <Select",
    "                value={",
    "                  provider !== null && model.length > 0",
    "                    ? modelValue(provider.id, model)",
    "                    : null",
    "                }",
    "                options={[]}",
    "                onChange={chooseModel}",
    "                triggerLabel=\"models\"",
    "                chevron={false}",
    "                groups={modelGroups}",
    "                onGroupOpen={(group) => void loadProviderModels(group.id)}",
    "                filter={{",
    "                  label: \"Free only\",",
    "                  active: freeOnly,",
    "                  onToggle: () => setFreeOnly((prev) => !prev),",
    "                  matches: (option) => freeValues.has(option.value),",
    "                }}",
    "              />",
  ),
  "the picker",
);

/* ------------------------------------------------------------------ *
 * the trigger's width — "models" is short, so it need not be a slot
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "  modelPicker: {",
    "    width: 132,",
    "  },",
  ),
  L(
    "  modelPicker: {",
    "    // The trigger says \"models\" and nothing else, so it needs a slot for",
    "    // six characters rather than for a model's name.",
    "    width: 104,",
    "  },",
  ),
  "the trigger's width",
);

fs.writeFileSync(f, b, "utf8");
console.log("tutor.tsx — the grouped model picker is written");
