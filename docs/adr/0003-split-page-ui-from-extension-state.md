# Split page UI from extension state

The extension splits responsibilities between a Content Script and a Service Worker. The Content Script owns ChatGPT page interaction and in-page UI, while the Service Worker owns the Conversation Database, import/export, and extension lifecycle so page-specific code stays separate from durable extension state.
