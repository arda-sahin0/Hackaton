/**
 * Demo-safety reports (NEXT_PUBLIC_DEMO_FALLBACK spirit): used when no model
 * provider is configured (RESEARCH_MODE=fixture) or the model is unreachable.
 * They cite only DOIs that have signed Airnode fixtures in api3evm/test/fixtures,
 * so every proof step still runs with real signatures.
 */
export const FIXTURE_VALID_DOI = "10.1038/nature14539"; // LeCun, Bengio, Hinton (2015), Deep learning
export const FIXTURE_RETRACTED_DOI = "10.1038/nature00870"; // retracted (Nature, 2002)

export function fixtureReport(input: string): string {
  const topic = input.trim().slice(0, 120) || "deep learning";
  return `# Literature summary: ${topic}

Assumption: the brief asks for a short technical overview; one foundational source is cited because this run replays a saved, signed proof.

Deep learning refers to representation learning with multi-layer neural networks whose parameters are fitted by stochastic gradient descent on large labelled datasets [1]. The key idea is that each layer transforms its input into a slightly more abstract representation, so that a composition of simple non-linear modules can learn very complex functions without hand-engineered features [1]. Convolutional networks exploit the local structure of images and audio through shared weights and pooling, which is why they dominate vision and speech recognition benchmarks, while recurrent networks model sequences such as text and speech [1].

The review by LeCun, Bengio and Hinton frames three reasons for the field's progress: larger datasets, cheaper parallel compute (GPUs), and better training methods such as rectified linear units and dropout [1]. It also notes open problems that remain active today: unsupervised learning from unlabelled data, combining representation learning with complex reasoning, and attention mechanisms that let a network decide which part of its input to process next [1].

For an agentic-payments setting the practical lesson is that model quality is a function of verified data; a claim is only as good as the source behind it, which is why every citation in this report is checked against OpenAlex and proven on-chain before the author is paid.

## References

[1] LeCun, Y., Bengio, Y., Hinton, G. (2015). Deep learning. Nature 521, 436–444. https://doi.org/${FIXTURE_VALID_DOI}

\`\`\`json
{"topic": ${JSON.stringify(topic)}, "minSources": 1, "dois": ["${FIXTURE_VALID_DOI}"]}
\`\`\`
`;
}
