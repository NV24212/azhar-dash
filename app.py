# ==============================================================================
#  FINAL APP.PY - With table rename and ALL functions restored
# ==============================================================================
import os
import uuid
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, and_
from sqlalchemy.exc import IntegrityError
from werkzeug.utils import secure_filename

# --- App & DB Setup ---
app = Flask(__name__, instance_relative_config=True)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'a-default-secret-key-for-local-dev')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'static', 'uploads')
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif'}
DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL or 'sqlite:///your_database.db'
db = SQLAlchemy(app)

# ==============================================================================
#  DATABASE MODELS (CORRECTED)
# ==============================================================================
class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Float, nullable=False)
    has_variants = db.Column(db.Boolean, default=False)
    simple_stock = db.Column(db.Integer, default=0)
    variants = db.relationship('ProductVariant', backref='product', lazy='dynamic', cascade="all, delete-orphan")
    images = db.relationship('ProductImage', backref='product', lazy='dynamic', cascade="all, delete-orphan")

class ProductVariant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    stock = db.Column(db.Integer, nullable=False, default=0)

class ProductImage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    filename = db.Column(db.String(100), nullable=False)

class Customer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(50), nullable=True)
    address = db.Column(db.String(200), nullable=True)
    orders = db.relationship('CustomerOrder', backref='customer', lazy=True, cascade="all, delete-orphan")

class CustomerOrder(db.Model):
    __tablename__ = 'customer_order'
    id = db.Column(db.Integer, primary_key=True)
    order_date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    total_value = db.Column(db.Float, nullable=False, default=0.0)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=True)
    status = db.Column(db.String(50), nullable=False, default='Not in-process')
    delivery_method = db.Column(db.String(50), nullable=False, default='Delivery')
    items = db.relationship('OrderItem', backref='customer_order', lazy='dynamic', cascade="all, delete-orphan")

class OrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('customer_order.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    variant_id = db.Column(db.Integer, db.ForeignKey('product_variant.id'), nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    price_per_item = db.Column(db.Float, nullable=False)
    product = db.relationship('Product')
    variant = db.relationship('ProductVariant')

# ==============================================================================
#  Helper Functions & Core Routes
# ==============================================================================
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'): return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function
@app.route('/login', methods=['GET', 'POST'])
def login():
    if session.get('logged_in'): return redirect(url_for('dashboard'))
    if request.method == 'POST':
        if request.form.get('password') == 'admin':
            session['logged_in'] = True
            return redirect(url_for('dashboard'))
        else:
            return render_template('auth/login.html', error="Invalid Password")
    return render_template('auth/login.html')
@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))
@app.route('/')
@login_required
def dashboard():
    total_revenue = db.session.query(func.sum(CustomerOrder.total_value)).scalar() or 0.0
    total_orders = CustomerOrder.query.count()
    recent_orders = CustomerOrder.query.order_by(CustomerOrder.order_date.desc()).limit(5).all()
    return render_template('index.html', total_revenue=f'{total_revenue:.2f}', total_orders=total_orders, recent_orders=recent_orders)
@app.route('/products')
@login_required
def products(): return render_template('products.html')
@app.route('/orders')
@login_required
def orders(): return render_template('orders.html')
@app.route('/customers')
@login_required
def customers(): return render_template('customers.html')
@app.route('/revenue')
@login_required
def revenue(): return render_template('revenue.html')
@app.route('/ui/product-form')
@login_required
def ui_product_form(): return render_template('product_form.html')
@app.route('/ui/customer-form')
@login_required
def ui_customer_form(): return render_template('customer_form.html')
@app.route('/ui/order-form')
@login_required
def ui_order_form(): return render_template('order_form.html')
@app.route('/ui/view-order-modal')
@login_required
def ui_view_order_modal(): return render_template('view_order_modal.html')

# ==============================================================================
#  API ROUTES
# ==============================================================================
@app.route('/api/products')
@login_required
def api_get_products():
    search = request.args.get('search', '').lower()
    query = Product.query
    if search:
        query = query.filter(Product.name.ilike(f'%{search}%'))
    products_list = query.all()
    results = []
    for p in products_list:
        if p.has_variants:
            stock = db.session.query(func.sum(ProductVariant.stock)).filter_by(product_id=p.id).scalar() or 0
        else:
            stock = p.simple_stock
        first_image = p.images.first()
        product_data = {'id': p.id, 'name': p.name, 'price': p.price, 'stock': stock, 'has_variants': p.has_variants, 'thumbnail': first_image.filename if first_image else None}
        if p.has_variants:
            product_data['variants'] = [{'id': v.id, 'name': v.name, 'stock': v.stock} for v in p.variants]
        else:
            product_data['stock'] = p.simple_stock
        results.append(product_data)
    return jsonify({'products': results})
@app.route('/api/product/<int:id>')
@login_required
def api_get_product(id):
    p = Product.query.get_or_404(id)
    return jsonify({'product': {'id': p.id, 'name': p.name, 'price': p.price, 'description': p.description, 'has_variants': p.has_variants, 'simple_stock': p.simple_stock, 'variants': [{'id': v.id, 'name': v.name, 'stock': v.stock} for v in p.variants], 'images': [{'id': i.id, 'filename': i.filename} for i in p.images]}})
@app.route('/api/product/add', methods=['POST'])
@login_required
def api_add_product():
    data = request.form
    try:
        new_product = Product(name=data['name'], price=float(data['price']), description=data.get('description'), has_variants=data.get('has_variants') == 'true')
        if new_product.has_variants:
            variant_names, variant_stocks = data.getlist('variant_names'), data.getlist('variant_stocks')
            for name, stock in zip(variant_names, variant_stocks):
                if name: new_product.variants.append(ProductVariant(name=name, stock=int(stock)))
        else:
            new_product.simple_stock = int(data.get('simple_stock', 0))
        db.session.add(new_product)
        files = request.files.getlist('images')
        for file in files:
            if file and allowed_file(file.filename):
                ext = file.filename.rsplit('.', 1)[1].lower()
                unique_filename = f"{uuid.uuid4()}.{ext}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
                new_product.images.append(ProductImage(filename=unique_filename))
        db.session.commit()
        return jsonify({'success': True, 'message': 'Product added!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f"An error occurred: {str(e)}"}), 500
@app.route('/api/product/<int:id>/edit', methods=['POST'])
@login_required
def api_edit_product(id):
    product = Product.query.get_or_404(id)
    data = request.form
    try:
        product.name, product.price, product.description = data['name'], float(data['price']), data.get('description')
        product.has_variants = data.get('has_variants') == 'true'
        product.variants.delete()
        if product.has_variants:
            product.simple_stock = 0
            variant_names, variant_stocks = data.getlist('variant_names'), data.getlist('variant_stocks')
            for name, stock in zip(variant_names, variant_stocks):
                if name: product.variants.append(ProductVariant(name=name, stock=int(stock)))
        else:
            product.simple_stock = int(data.get('simple_stock', 0))
        files = request.files.getlist('images')
        for file in files:
            if file and allowed_file(file.filename):
                ext = file.filename.rsplit('.', 1)[1].lower()
                unique_filename = f"{uuid.uuid4()}.{ext}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
                product.images.append(ProductImage(filename=unique_filename))
        db.session.commit()
        return jsonify({'success': True, 'message': 'Product updated!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
@app.route('/api/image/<int:id>/delete', methods=['POST'])
@login_required
def api_delete_image(id):
    image = ProductImage.query.get_or_404(id)
    try:
        os.remove(os.path.join(app.config['UPLOAD_FOLDER'], image.filename))
        db.session.delete(image)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Image deleted!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
@app.route('/api/product/<int:id>/delete', methods=['POST'])
@login_required
def api_delete_product(id):
    product = Product.query.get_or_404(id)
    try:
        for image in product.images:
            try: os.remove(os.path.join(app.config['UPLOAD_FOLDER'], image.filename))
            except OSError: pass
        db.session.delete(product)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Product deleted!'})
    except IntegrityError:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Cannot delete product associated with an order.'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
@app.route('/api/customers')
@login_required
def api_get_customers():
    query = Customer.query
    search = request.args.get('search')
    if search: query = query.filter(Customer.name.ilike(f'%{search}%'))
    return jsonify({'customers': [{'id': c.id, 'name': c.name, 'phone': c.phone, 'address': c.address} for c in query.all()]})
@app.route('/api/customer/<int:id>')
@login_required
def api_get_customer(id):
    c = Customer.query.get_or_404(id)
    return jsonify({'customer': {'id': c.id, 'name': c.name, 'phone': c.phone, 'address': c.address}})
@app.route('/api/customer/add', methods=['POST'])
@login_required
def api_add_customer():
    data = request.get_json()
    if not data.get('name'): return jsonify({'success': False, 'message': 'Customer name is required.'}), 400
    try:
        new_customer = Customer(name=data['name'], phone=data.get('phone'), address=data.get('address'))
        db.session.add(new_customer)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Customer added!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
@app.route('/api/customer/<int:id>/edit', methods=['POST'])
@login_required
def api_edit_customer(id):
    customer = Customer.query.get_or_404(id)
    data = request.get_json()
    try:
        customer.name, customer.phone, customer.address = data['name'], data.get('phone'), data.get('address')
        db.session.commit()
        return jsonify({'success': True, 'message': 'Customer updated!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
@app.route('/api/customer/<int:id>/delete', methods=['POST'])
@login_required
def api_delete_customer(id):
    customer = Customer.query.get_or_404(id)
    if customer.orders: return jsonify({'success': False, 'message': 'Cannot delete customer with existing orders.'}), 400
    try:
        db.session.delete(customer)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Customer deleted!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
@app.route('/api/orders')
@login_required
def api_get_orders():
    orders_list = CustomerOrder.query.order_by(CustomerOrder.order_date.desc()).all()
    return jsonify({'orders': [{'id': o.id, 'customer_name': o.customer.name if o.customer else 'N/A', 'date': o.order_date.strftime('%d %b %Y'), 'total_value': f'{o.total_value:.2f}', 'item_count': o.items.count(), 'status': o.status, 'delivery_method': o.delivery_method} for o in orders_list]})
@app.route('/api/order/<int:id>')
@login_required
def api_get_order(id):
    order = CustomerOrder.query.get_or_404(id)
    customer = order.customer
    items_data = []
    for item in order.items:
        first_image = item.product.images.first()
        thumbnail = first_image.filename if first_image else None
        items_data.append({'product_id': item.product_id, 'variant_id': item.variant_id, 'quantity': item.quantity, 'name': f"{item.product.name} ({item.variant.name})" if item.variant else item.product.name, 'price': item.price_per_item, 'thumbnail': thumbnail, 'has_variants': item.product.has_variants, 'variants': [{'id': v.id, 'name': v.name} for v in item.product.variants] if item.product.has_variants else []})
    return jsonify({'order': {'id': order.id, 'customer_id': order.customer_id, 'status': order.status, 'delivery_method': order.delivery_method, 'total_value': f'{order.total_value:.2f}', 'date': order.order_date.strftime('%d %b %Y, %I:%M %p'), 'customer_info': {'name': customer.name, 'phone': customer.phone or 'N/A', 'address': customer.address or 'N/A'}, 'items': items_data}})
@app.route('/api/order/add', methods=['POST'])
@login_required
def api_add_order():
    data = request.get_json()
    try:
        customer = Customer.query.get(data['customer_id'])
        if not customer: return jsonify({'success': False, 'message': 'Customer not found.'}), 404
        new_order = CustomerOrder(customer=customer, total_value=0, status='Not in-process', delivery_method=data.get('delivery_method', 'Delivery'))
        total_order_value = 0
        for item_data in data['items']:
            product = Product.query.get(item_data['product_id'])
            if not product: continue
            new_item = OrderItem(customer_order=new_order, product_id=product.id, variant_id=item_data.get('variant_id'), quantity=item_data['quantity'], price_per_item=product.price)
            total_order_value += product.price * item_data['quantity']
            db.session.add(new_item)
        new_order.total_value = total_order_value
        db.session.add(new_order)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Order created successfully!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
@app.route('/api/order/<int:id>/edit', methods=['POST'])
@login_required
def api_edit_order(id):
    order = CustomerOrder.query.get_or_404(id)
    data = request.get_json()
    try:
        order.customer_id = data['customer_id']
        order.status = data['status']
        order.delivery_method = data.get('delivery_method', 'Delivery')
        order.items.delete()
        total_order_value = 0
        for item_data in data['items']:
            product = Product.query.get(item_data['product_id'])
            if not product: continue
            new_item = OrderItem(order_id=order.id, product_id=product.id, variant_id=item_data.get('variant_id'), quantity=item_data['quantity'], price_per_item=product.price)
            total_order_value += product.price * item_data['quantity']
            db.session.add(new_item)
        order.total_value = total_order_value
        db.session.commit()
        return jsonify({'success': True, 'message': 'Order updated successfully!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
@app.route('/api/order/<int:id>/status', methods=['POST'])
@login_required
def api_update_order_status(id):
    order = CustomerOrder.query.get_or_404(id)
    data = request.get_json()
    new_status = data.get('status')
    allowed_statuses = ['Not in-process', 'Processing', 'Completed']
    if new_status not in allowed_statuses:
        return jsonify({'success': False, 'message': 'Invalid status provided.'}), 400
    try:
        order.status = new_status
        db.session.commit()
        return jsonify({'success': True, 'message': f'Order status updated to {new_status}.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
@app.route('/api/order/<int:id>/delete', methods=['POST'])
@login_required
def api_delete_order(id):
    order = CustomerOrder.query.get_or_404(id)
    try:
        db.session.delete(order)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Order deleted!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
@app.route('/api/revenue-data')
@login_required
def api_revenue_data():
    today = datetime.utcnow()
    monthly_labels, monthly_data = [], []
    for i in range(11, -1, -1):
        target_month_date = today - timedelta(days=i * 30)
        month_start = target_month_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        next_month_start = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        monthly_total = db.session.query(func.sum(CustomerOrder.total_value)).filter(CustomerOrder.order_date >= month_start, CustomerOrder.order_date < next_month_start).scalar() or 0.0
        monthly_labels.append(month_start.strftime('%b %Y'))
        monthly_data.append(round(monthly_total, 2))
    daily_labels, daily_data = [], []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        daily_total = db.session.query(func.sum(CustomerOrder.total_value)).filter(func.date(CustomerOrder.order_date) == day.date()).scalar() or 0.0
        daily_labels.append(day.strftime('%a, %d'))
        daily_data.append(round(daily_total, 2))
    return jsonify({'monthly': {'labels': monthly_labels, 'data': monthly_data}, 'daily': {'labels': daily_labels, 'data': daily_data}})

# ==============================================================================
#  INITIALIZATION & SERVER START
# ==============================================================================
if __name__ == '__main__':
    with app.app_context():
        if not os.path.exists(app.config['UPLOAD_FOLDER']):
            os.makedirs(app.config['UPLOAD_FOLDER'])
        db.create_all()
    app.run(debug=True)