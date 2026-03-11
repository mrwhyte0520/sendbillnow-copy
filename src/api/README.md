# Internal App API

This directory provides a lightweight client layer for the existing server-side `/api` endpoints.

Available helpers:

- `appApi.getProducts()`
- `appApi.getProductById(id)`
- `appApi.getSuppliers()`
- `appApi.getInvoices()`
- `appApi.getClients()`

These helpers are read-only and do not replace existing module services.
