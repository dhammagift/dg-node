# MCP registry entry

`server.json` is the entry of https://api.dhamma.gift/mcp in the official MCP registry
(https://registry.modelcontextprotocol.io, name `gift.dhamma/pali-canon`), published 2026-10-17.

To publish a new version: raise `version`, then from this folder
`mcp-publisher login dns --domain dhamma.gift --private-key <hex>` and `mcp-publisher publish`.
The key is /root/.secrets/mcp-registry-ed25519.pem on f3 (hex of the raw private key:
`openssl pkey -in … -outform DER | tail -c 32 | xxd -p -c 64`); its public half is the
`v=MCPv1; k=ed25519; p=…` TXT record on dhamma.gift in Cloudflare. mcp-publisher:
github.com/modelcontextprotocol/registry releases.
