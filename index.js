const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { query } = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u5otf.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' })
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const toolsCollection = client.db('camera_tools').collection('tools');
    const userCollection = client.db('camera_tools').collection('users');
    const orderCollection = client.db('camera_tools').collection('orders');
    const reviewCollection = client.db('camera_tools').collection('reviews');
    const profileCollection = client.db('camera_tools').collection('profiles');
    const paymentCollection = client.db('camera_tools').collection('payments');

    const verifyAdmin = async(req, res, next)=>{
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        next(); 
      }
      else{
        res.status(403).send({message: 'forbidden'});
      }
    }

  
    app.post('/create-payment-intent',verifyJWT, async(req, res)=>{
      const service = req.body; 
      const price = service.price;
      const amount = price*100; 
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount, 
        currency: 'usd', 
        payment_method_types: ['card']
      }); 
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    }); 

    app.get('/admin/:email', async(req, res) =>{
      const email = req.params.email;
      const user = await userCollection.findOne({email: email});
      const isAdmin = user.role === 'admin';
      res.send({admin: isAdmin})
    })

    app.put('/user/admin/:email', verifyJWT,verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: 'admin' },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.get('/user', verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });


    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ result, token });
    })

    // Products 

    app.get('/tools', async(req, res)=>{
      const tools = await toolsCollection.find().toArray(); 
      res.send(tools); 
    })

    app.get('/tool/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: ObjectId(id)}; 
      const tool = await toolsCollection.findOne(query); 
      res.send(tool); 
    })

    app.post('/tool', async(req, res)=>{
      const product = req.body; 
      const result = await toolsCollection.insertOne(product); 
      res.send({result, success: true}); 
    })

    app.delete('/tool/:id', async(req, res)=>{
      const id = req.params.id; 
      const query = {_id:ObjectId(id)};
      const result = await toolsCollection.deleteOne(query);
      res.send(result); 
    })


    // Order 

    app.get('/order/admin',verifyJWT, async(req, res)=>{
      const result = await orderCollection.find().toArray();
      return res.send(result); 
    })

    app.get('/order/:id',verifyJWT, async(req, res)=>{
      const id = req.params.id; 
      const query = {_id: ObjectId(id)};
      const result = await orderCollection.findOne(query);
      return res.send(result); 
    })

    app.get('/order',verifyJWT, async(req, res)=>{
      const decodedEmail = req.decoded.email;
      const email = req.query.email;
      if(decodedEmail==email){
        const query = {email:email};
        const result = await orderCollection.find(query).toArray();
        return res.send(result); 
      }
      else {
        res.status(403).send({message: 'forbidden access'}); 
      }
    })

    app.post('/order',async(req, res)=>{
      const order = req.body; 
      const id = order.productId;
      const query = {_id: ObjectId(id)};
      const parts = await toolsCollection.findOne(query);
      const updateDoc = {
        $set: {
          quantity: parts.quantity - order.quantity,
        }
      }
      await toolsCollection.updateOne(query, updateDoc); 
      const result = await orderCollection.insertOne(order); 
      res.send({result, success: true}); 
    })
    
    app.delete('/order/:id', async(req, res)=>{
      const id = req.params.id; 
      const query = {_id:ObjectId(id)};
      const result = await orderCollection.deleteOne(query);
      res.send(result); 
    })

    app.patch('/order/admin/:id', verifyJWT, async(req, res)=>{
      const id = req.params.id; 
      console.log(id);
      const filter = {_id: ObjectId(id)}; 
      const updateDoc = {
        $set: {
          adminShipped: true, 
        }
      }

      const updateOrder = await orderCollection.updateOne(filter, updateDoc); 
      res.send(updateDoc); 
    })

    app.patch('/order/:id', verifyJWT, async(req, res)=>{
      const id = req.params.id; 
      const payment = req.body;
      const filter = {_id: ObjectId(id)}; 
      const updateDoc = {
        $set: {
          paid: true, 
          transactionId: payment.transactionId,
        }
      }

      const updateOrder = await orderCollection.updateOne(filter, updateDoc); 
      const result = await paymentCollection.insertOne(payment); 
      res.send(updateDoc); 
    })

    // Review 
    app.get('/review', async(req, res)=>{
      const review = await reviewCollection.find().toArray();
      res.send(review);
    })

    app.post('/review', async(req, res)=>{
      const review = req.body; 
      const result = await reviewCollection.insertOne(review); 
      res.send({result, success: true}); 
    })

    // Profile
    app.get('/profile', async(req, res)=>{
      const email = req.query.email;
      const query = {email: email}; 
      const profile = await profileCollection.findOne(query); 
      res.send(profile)
    })
    
    app.post('/profile', async(req, res)=>{
      const profile = req.body; 
      const email = profile.email; 
      const filter = {email:email};
      const exists = await profileCollection.findOne(filter); 
      if(exists) {
        const updateDoc = {
          $set: profile,
        }
        const result = await profileCollection.updateOne(filter, updateDoc); 
        res.send({result, success: true});
      }
      else {
        const result = await profileCollection.insertOne(profile); 
        return res.send({result, success: true});
      }
    })
  }
  finally{

  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello From photography-camera-tools-site!')
})

app.listen(port, () => {
  console.log(`photography-camera-tools listening on port ${port}`)
})