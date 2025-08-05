// =========================================================================
// FINAL MAIN.JS - With Fulfillment Method on Orders List
// =========================================================================
document.addEventListener('DOMContentLoaded', function () {

    // --- Global Elements & Utilities ---
    const mainModalElement = document.getElementById('mainModal');
    const mainModal = new bootstrap.Modal(mainModalElement);
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = mainModalElement.querySelector('.modal-body');
    const modalSaveButton = document.getElementById('modalSaveButton');
    let currentSaveHandler = null;

    async function fetchAPI(url, options = {}) {
        try {
            const isFormData = options.body instanceof FormData;
            if (!isFormData && options.body) { options.headers = { 'Content-Type': 'application/json', ...options.headers }; options.body = JSON.stringify(options.body); }
            const response = await fetch(url, options);
            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); } catch (e) { throw new Error(response.statusText); }
                throw new Error(errorData.message || 'An unknown error occurred.');
            }
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) { return await response.json(); }
            return { success: true };
        } catch (error) {
            console.error('API Error:', error);
            alert(`Error: ${error.message}`);
            return null;
        }
    }
    async function showModal(title, formUrl, setupFunction) {
        modalTitle.textContent = title;
        modalBody.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div></div>';
        mainModal.show();
        const response = await fetch(formUrl);
        modalBody.innerHTML = await response.text();
        if (setupFunction) await setupFunction();
    }
    function getStatusClass(status) {
        if (status === 'Completed') return 'bg-success';
        if (status === 'Processing') return 'bg-warning text-dark';
        return 'bg-secondary';
    }

    // --- Products and Customers Logic (Unchanged but included for completeness) ---
    const productPage = document.getElementById('product-table-body');
    if (productPage) {
        const productTableBody = document.getElementById('product-table-body');
        const addProductBtn = document.getElementById('addProductBtn');
        function renderProducts(products) {
            productTableBody.innerHTML = '';
            if (products.length === 0) { productTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No products found.</td></tr>'; return; }
            products.forEach(p => {
                const thumbnail = p.thumbnail ? `<img src="/static/uploads/${p.thumbnail}" class="img-thumbnail" style="width: 50px; height: 50px; object-fit: cover;">` : '<div class="img-thumbnail" style="width: 50px; height: 50px; background-color: #f8f9fa;"></div>';
                const stockInfo = p.has_variants ? `<span class="badge bg-primary">Variants</span>` : `<span class="badge bg-secondary">${p.stock}</span>`;
                const row = `<tr><td class="d-flex align-items-center">${thumbnail}<strong class="ms-3">${p.name}</strong></td><td>$${p.price.toFixed(2)}</td><td>${stockInfo}</td><td class="text-end"><button class="btn btn-sm btn-secondary edit-product-btn" data-id="${p.id}">Edit</button><button class="btn btn-sm btn-danger delete-product-btn" data-id="${p.id}">Delete</button></td></tr>`;
                productTableBody.insertAdjacentHTML('beforeend', row);
            });
        }
        async function loadProducts() {
            const result = await fetchAPI('/api/products');
            if (result) renderProducts(result.products);
        }
        function setupProductFormLogic() {
            const hasVariantsSwitch = document.getElementById('hasVariants');
            const simpleStockContainer = document.getElementById('simpleStockContainer');
            const variantsContainer = document.getElementById('variantsContainer');
            const addVariantBtn = document.getElementById('addVariantBtn');
            const variantsList = document.getElementById('variantsList');
            const toggleVariantView = () => {
                if (hasVariantsSwitch.checked) { simpleStockContainer.classList.add('d-none'); variantsContainer.classList.remove('d-none'); }
                else { simpleStockContainer.classList.remove('d-none'); variantsContainer.classList.add('d-none'); }
            };
            const addVariantRow = (name = '', stock = 0) => {
                const row = document.createElement('div');
                row.className = 'input-group mb-2';
                row.innerHTML = `<input type="text" name="variant_names" class="form-control" placeholder="Variant Name" value="${name}"><input type="number" name="variant_stocks" class="form-control" placeholder="Stock" value="${stock}"><button class="btn btn-outline-danger remove-variant-btn" type="button">&times;</button>`;
                variantsList.appendChild(row);
            };
            hasVariantsSwitch.addEventListener('change', toggleVariantView);
            addVariantBtn.addEventListener('click', () => addVariantRow());
            variantsList.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-variant-btn')) e.target.closest('.input-group').remove();
            });
            toggleVariantView();
            return { addVariantRow };
        }
        addProductBtn.addEventListener('click', () => {
            showModal('Add New Product', '/ui/product-form', () => {
                setupProductFormLogic();
                modalSaveButton.classList.remove('d-none');
                currentSaveHandler = async () => {
                    const form = document.getElementById('productForm');
                    const formData = new FormData(form);
                    const result = await fetchAPI('/api/product/add', { method: 'POST', body: formData });
                    if (result) { mainModal.hide(); loadProducts(); }
                };
            });
        });
        productTableBody.addEventListener('click', async (e) => {
            const target = e.target;
            const id = target.dataset.id;
            if (target.classList.contains('edit-product-btn')) {
                const result = await fetchAPI(`/api/product/${id}`);
                if (!result) return;
                const product = result.product;
                showModal('Edit Product', '/ui/product-form', () => {
                    const { addVariantRow } = setupProductFormLogic();
                    document.getElementById('productId').value = product.id;
                    document.getElementById('productName').value = product.name;
                    document.getElementById('productPrice').value = product.price;
                    document.getElementById('productDescription').value = product.description;
                    const hasVariantsSwitch = document.getElementById('hasVariants');
                    if (product.has_variants) {
                        hasVariantsSwitch.checked = true;
                        product.variants.forEach(v => addVariantRow(v.name, v.stock));
                    } else {
                        document.getElementById('simpleStock').value = product.simple_stock;
                    }
                    hasVariantsSwitch.dispatchEvent(new Event('change'));
                    const existingImagesContainer = document.getElementById('existingImages');
                    existingImagesContainer.innerHTML = '';
                    product.images.forEach(img => {
                        existingImagesContainer.innerHTML += `<div class="col-auto" id="image-${img.id}"><div class="card"><img src="/static/uploads/${img.filename}" class="card-img-top" style="width: 100px; height: 100px; object-fit: cover;"><div class="card-body p-1 text-center"><button type="button" class="btn btn-tiny btn-danger delete-image-btn" data-id="${img.id}">&times;</button></div></div></div>`;
                    });
                    modalSaveButton.classList.remove('d-none');
                    currentSaveHandler = async () => {
                        const form = document.getElementById('productForm');
                        const formData = new FormData(form);
                        const result = await fetchAPI(`/api/product/${id}/edit`, { method: 'POST', body: formData });
                        if (result) { mainModal.hide(); loadProducts(); }
                    };
                });
            }
            if (target.classList.contains('delete-product-btn')) {
                if (confirm('Are you sure you want to delete this product?')) {
                    const result = await fetchAPI(`/api/product/${id}/delete`, { method: 'POST' });
                    if (result) loadProducts();
                }
            }
        });
        modalBody.addEventListener('click', async (e) => {
            if (e.target.classList.contains('delete-image-btn')) {
                const imageId = e.target.dataset.id;
                if (confirm('Delete this image permanently?')) {
                    const result = await fetchAPI(`/api/image/${imageId}/delete`, { method: 'POST' });
                    if (result) document.getElementById(`image-${imageId}`).remove();
                }
            }
        });
        loadProducts();
    }
    const customerPage = document.getElementById('customer-table-body');
    if (customerPage) {
        const customerTableBody = document.getElementById('customer-table-body');
        const addCustomerBtn = document.getElementById('addCustomerBtn');
        const customerSearchInput = document.getElementById('customerSearchInput');
        function renderCustomers(customers) {
            customerTableBody.innerHTML = '';
            if (customers.length === 0) {
                customerTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No customers found.</td></tr>';
                return;
            }
            customers.forEach(c => {
                const row = `<tr><td><strong>${c.name}</strong></td><td>${c.phone || 'N/A'}</td><td>${c.address || 'N/A'}</td><td class="text-end"><button class="btn btn-sm btn-secondary edit-customer-btn" data-id="${c.id}">Edit</button><button class="btn btn-sm btn-danger delete-customer-btn" data-id="${c.id}">Delete</button></td></tr>`;
                customerTableBody.insertAdjacentHTML('beforeend', row);
            });
        }
        async function loadCustomers(searchTerm = '') {
            const url = searchTerm ? `/api/customers?search=${searchTerm}` : '/api/customers';
            const result = await fetchAPI(url);
            if (result) renderCustomers(result.customers);
        }
        addCustomerBtn.addEventListener('click', () => {
            showModal('Add New Customer', '/ui/customer-form', () => {
                modalSaveButton.classList.remove('d-none');
                currentSaveHandler = async () => {
                    const data = { name: document.getElementById('customerName').value, phone: document.getElementById('customerPhone').value, address: document.getElementById('customerAddress').value };
                    const result = await fetchAPI('/api/customer/add', { method: 'POST', body: data });
                    if (result) { mainModal.hide(); loadCustomers(); }
                };
            });
        });
        customerTableBody.addEventListener('click', async (e) => {
            const target = e.target;
            const id = target.dataset.id;
            if (target.classList.contains('edit-customer-btn')) {
                const result = await fetchAPI(`/api/customer/${id}`);
                if (!result) return;
                const customer = result.customer;
                showModal('Edit Customer', '/ui/customer-form', () => {
                    document.getElementById('customerId').value = customer.id;
                    document.getElementById('customerName').value = customer.name;
                    document.getElementById('customerPhone').value = customer.phone;
                    document.getElementById('customerAddress').value = customer.address;
                    modalSaveButton.classList.remove('d-none');
                    currentSaveHandler = async () => {
                        const data = { name: document.getElementById('customerName').value, phone: document.getElementById('customerPhone').value, address: document.getElementById('customerAddress').value };
                        const result = await fetchAPI(`/api/customer/${id}/edit`, { method: 'POST', body: data });
                        if (result) { mainModal.hide(); loadCustomers(); }
                    };
                });
            }
            if (target.classList.contains('delete-customer-btn')) {
                if (confirm('Are you sure you want to delete this customer?')) {
                    const result = await fetchAPI(`/api/customer/${id}/delete`, { method: 'POST' });
                    if (result) loadCustomers();
                }
            }
        });
        customerSearchInput.addEventListener('input', () => loadCustomers(customerSearchInput.value));
        loadCustomers();
    }
    
    // =========================================================================
    // ORDERS PAGE LOGIC
    // =========================================================================
    const orderPage = document.getElementById('order-table-body');
    if (orderPage) {
        const orderTableBody = document.getElementById('order-table-body');
        const addOrderBtn = document.getElementById('addOrderBtn');
        function renderOrders(orders) {
            orderTableBody.innerHTML = '';
            if (orders.length === 0) {
                orderTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No orders found.</td></tr>'; return;
            }
            orders.forEach(o => {
                const statuses = ['Not in-process', 'Processing', 'Completed'];
                const options = statuses.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('');
                const statusSelector = `<select class="form-select form-select-sm status-change-select ${getStatusClass(o.status).replace('bg-', 'badge-')}" data-id="${o.id}">${options}</select>`;
                
                // --- NEW: Create the fulfillment badge ---
                const fulfillmentBadge = o.delivery_method === 'Pickup' 
                    ? `<span class="badge bg-info text-dark">Pickup</span>` 
                    : `<span class="badge bg-light text-dark">Delivery</span>`;

                const row = `<tr><td><strong>#${o.id}</strong></td><td>${o.customer_name}</td><td>${o.date}</td><td>$${o.total_value}</td><td>${fulfillmentBadge}</td><td>${statusSelector}</td><td class="text-end"><button class="btn btn-sm btn-info view-order-btn" data-id="${o.id}">View</button> <button class="btn btn-sm btn-secondary edit-order-btn" data-id="${o.id}">Edit</button> <button class="btn btn-sm btn-danger delete-order-btn" data-id="${o.id}">Delete</button></td></tr>`;
                orderTableBody.insertAdjacentHTML('beforeend', row);
            });
        }
        async function loadOrders() {
            const result = await fetchAPI('/api/orders');
            if (result) renderOrders(result.orders);
        }
        function setupOrderForm(orderData = null) {
            let selectedItems = orderData ? [...orderData.items] : [];
            const renderOrderItems = () => {
                const itemsBody = document.getElementById('orderItemsTableBody');
                let total = 0;
                itemsBody.innerHTML = '';
                if (selectedItems.length === 0) {
                    itemsBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No products added yet.</td></tr>';
                } else {
                    selectedItems.forEach((item, index) => {
                        const subtotal = item.price * item.quantity;
                        total += subtotal;
                        let variantSelector = '';
                        if (item.has_variants) {
                            const options = item.variants.map(v => `<option value="${v.id}" ${v.id == item.variant_id ? 'selected' : ''}>${v.name}</option>`).join('');
                            variantSelector = `<select class="form-select form-select-sm variant-selector mt-1" data-index="${index}">${options}</select>`;
                        }
                        const row = `<tr><td>${item.name}${variantSelector}</td><td><input type="number" class="form-control form-control-sm quantity-input" value="${item.quantity}" min="1" data-index="${index}"></td><td class="text-end">$${item.price.toFixed(2)}</td><td class="text-end"><strong>$${subtotal.toFixed(2)}</strong></td><td class="text-end"><button class="btn btn-tiny btn-outline-danger remove-item-btn" data-index="${index}">&times;</button></td></tr>`;
                        itemsBody.insertAdjacentHTML('beforeend', row);
                    });
                }
                document.getElementById('orderTotal').textContent = `$${total.toFixed(2)}`;
            };
            const customerSelect = document.getElementById('orderCustomer');
            const productSearch = document.getElementById('productSearch');
            const searchResults = document.getElementById('productSearchResults');
            const itemsBody = document.getElementById('orderItemsTableBody');
            if (orderData) {
                document.getElementById('status-section').classList.remove('d-none');
                document.getElementById('orderStatus').value = orderData.status;
                document.querySelector(`input[name="delivery_method"][value="${orderData.delivery_method}"]`).checked = true;
            }
            fetchAPI('/api/customers').then(result => {
                if (result) {
                    result.customers.forEach(c => customerSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);
                    if (orderData) customerSelect.value = orderData.customer_id;
                }
            });
            productSearch.addEventListener('input', async () => {
                const term = productSearch.value;
                if (term.length < 2) { searchResults.innerHTML = ''; return; }
                const result = await fetchAPI(`/api/products?search=${term}`);
                searchResults.innerHTML = '';
                if (result) {
                    result.products.forEach(p => {
                        const productElement = document.createElement('a');
                        productElement.href = '#';
                        productElement.className = 'list-group-item list-group-item-action add-product-to-order';
                        productElement.innerHTML = `<strong>${p.name}</strong> - $${p.price.toFixed(2)}`;
                        productElement.dataset.product = JSON.stringify(p);
                        searchResults.appendChild(productElement);
                    });
                }
            });
            searchResults.addEventListener('click', e => {
                e.preventDefault();
                const target = e.target.closest('.add-product-to-order');
                if (target) {
                    const product = JSON.parse(target.dataset.product);
                    const existingItem = selectedItems.find(item => item.product_id === product.id && !item.has_variants);
                    if (existingItem) {
                        existingItem.quantity++;
                    } else {
                        const newItem = { product_id: product.id, name: product.name, price: product.price, quantity: 1, has_variants: product.has_variants };
                        if (product.has_variants) { newItem.variants = product.variants; newItem.variant_id = product.variants[0].id; }
                        selectedItems.push(newItem);
                    }
                    productSearch.value = '';
                    searchResults.innerHTML = '';
                    renderOrderItems();
                }
            });
            itemsBody.addEventListener('click', e => {
                if (e.target.classList.contains('remove-item-btn')) {
                    selectedItems.splice(e.target.dataset.index, 1);
                    renderOrderItems();
                }
            });
            itemsBody.addEventListener('change', e => {
                const target = e.target;
                const index = target.dataset.index;
                if (target.classList.contains('quantity-input')) selectedItems[index].quantity = parseInt(target.value);
                if (target.classList.contains('variant-selector')) selectedItems[index].variant_id = parseInt(target.value);
                renderOrderItems();
            });
            renderOrderItems();
            currentSaveHandler = async () => {
                const payload = {
                    customer_id: customerSelect.value,
                    status: orderData ? document.getElementById('orderStatus').value : 'Not in-process',
                    delivery_method: document.querySelector('input[name="delivery_method"]:checked').value,
                    items: selectedItems.map(item => ({ product_id: item.product_id, variant_id: item.variant_id || null, quantity: item.quantity }))
                };
                if (!payload.customer_id || payload.items.length === 0) {
                    alert('Please select a customer and add at least one product.'); return;
                }
                const result = orderData ? await fetchAPI(`/api/order/${orderData.id}/edit`, { method: 'POST', body: payload }) : await fetchAPI('/api/order/add', { method: 'POST', body: payload });
                if (result) { mainModal.hide(); loadOrders(); }
            };
        }
        addOrderBtn.addEventListener('click', () => {
            showModal('Add New Order', '/ui/order-form', () => setupOrderForm());
            modalSaveButton.classList.remove('d-none');
        });
        orderTableBody.addEventListener('click', async (e) => {
            const target = e.target;
            const id = target.dataset.id;
            if (target.classList.contains('edit-order-btn')) {
                const result = await fetchAPI(`/api/order/${id}`);
                if (result) {
                    showModal('Edit Order', '/ui/order-form', () => setupOrderForm(result.order));
                    modalSaveButton.classList.remove('d-none');
                }
            }
            if (target.classList.contains('delete-order-btn')) {
                if (confirm('Are you sure you want to delete this order?')) {
                    const result = await fetchAPI(`/api/order/${id}/delete`, { method: 'POST' });
                    if (result) loadOrders();
                }
            }
            if (target.classList.contains('view-order-btn')) {
                const result = await fetchAPI(`/api/order/${id}`);
                if (result) {
                    const order = result.order;
                    showModal(`Order Details #${order.id}`, '/ui/view-order-modal', () => {
                        document.getElementById('viewCustomerName').textContent = order.customer_info.name;
                        document.getElementById('viewCustomerPhone').textContent = order.customer_info.phone;
                        document.getElementById('viewCustomerAddress').textContent = order.customer_info.address;
                        document.getElementById('viewOrderId').textContent = `#${order.id}`;
                        document.getElementById('viewOrderDate').textContent = order.date;
                        const statusBadge = document.getElementById('viewOrderStatus');
                        statusBadge.textContent = order.status;
                        statusBadge.className = `badge ${getStatusClass(order.status)}`;
                        const fulfillmentBadge = document.getElementById('viewOrderFulfillment');
                        fulfillmentBadge.textContent = order.delivery_method;
                        fulfillmentBadge.className = `badge ${order.delivery_method === 'Pickup' ? 'bg-info text-dark' : 'bg-light text-dark'}`;
                        const itemsBody = document.getElementById('viewOrderItems');
                        itemsBody.innerHTML = '';
                        order.items.forEach(item => {
                            const thumbnail = item.thumbnail ? `<img src="/static/uploads/${item.thumbnail}" class="img-thumbnail" style="width: 50px; height: 50px; object-fit: cover;">` : '<div class="img-thumbnail" style="width: 50px; height: 50px; background-color: #f8f9fa;"></div>';
                            itemsBody.innerHTML += `<tr><td>${thumbnail}</td><td>${item.name}</td><td>${item.quantity}</td><td class="text-end">$${item.price.toFixed(2)}</td><td class="text-end">$${(item.price * item.quantity).toFixed(2)}</td></tr>`;
                        });
                        document.getElementById('viewOrderTotal').textContent = `$${order.total_value}`;
                        modalSaveButton.classList.add('d-none');
                    });
                }
            }
        });
        orderTableBody.addEventListener('change', async (e) => {
            const target = e.target;
            if (target.classList.contains('status-change-select')) {
                const orderId = target.dataset.id;
                const newStatus = target.value;
                const result = await fetchAPI(`/api/order/${orderId}/status`, {
                    method: 'POST',
                    body: { status: newStatus }
                });
                if (result) {
                    target.className = `form-select form-select-sm status-change-select ${getStatusClass(newStatus).replace('bg-', 'badge-')}`;
                }
            }
        });
        loadOrders();
    }

    const revenuePage = document.getElementById('monthlyRevenueChart');
    if (revenuePage) {
        let monthlyChartInstance, dailyChartInstance;
        const chartOptions = { scales: { y: { beginAtZero: true } }, responsive: true, maintainAspectRatio: false };
        const renderMonthlyChart = (chartData) => {
            if (monthlyChartInstance) monthlyChartInstance.destroy();
            monthlyChartInstance = new Chart(document.getElementById('monthlyRevenueChart'), { type: 'bar', data: { labels: chartData.labels, datasets: [{ label: 'Monthly Revenue', data: chartData.data, backgroundColor: '#742370' }] }, options: chartOptions });
        };
        const renderDailyChart = (chartData) => {
            if (dailyChartInstance) dailyChartInstance.destroy();
            dailyChartInstance = new Chart(document.getElementById('dailyRevenueChart'), { type: 'line', data: { labels: chartData.labels, datasets: [{ label: 'Daily Revenue', data: chartData.data, borderColor: '#401951', tension: 0.1 }] }, options: chartOptions });
        };
        async function loadRevenueData() {
            const result = await fetchAPI('/api/revenue-data');
            if (result) { renderMonthlyChart(result.monthly); renderDailyChart(result.daily); }
        }
        loadRevenueData();
    }

    modalSaveButton.addEventListener('click', () => {
        if (currentSaveHandler) currentSaveHandler();
    });
    const path = window.location.pathname;
    const pageName = path === '/' ? 'dashboard' : path.split("/").pop() || 'dashboard';
    const activeLink = document.querySelector(`.sidebar .nav-link[href*="${pageName}"]`);
    if(activeLink && pageName !== 'login') {
        activeLink.classList.add('active');
    } else if (path === '/') {
        const dashboardLink = document.querySelector('.sidebar .nav-link[data-page="dashboard"]');
        if(dashboardLink) dashboardLink.classList.add('active');
    }
});