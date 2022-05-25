const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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

    app.get('/order', async(req, res)=>{

    })

    app.post('/order',async(req, res)=>{
      const order = req.body; 
      const result = await orderCollection.insertOne(order); 
      res.send({result, success: true}); 
      // const currentQuentity = order.quantity;
      // const filter = {toolsName: order.toolsName}
      // const exists = await orderCollection.findOne(filter);
      // if(exists) {
      //   order.quantity = parseInt(exists.quantity) + parseInt(currentQuentity);
      //   const updateDoc = {
      //     $set: {quantity: order.quantity }
      //   }
      //   console.log(order);
      //   const result = await orderCollection.updateOne(filter, updateDoc); 
      //   return res.send({success: true, order})
      // }
      // else {
      //   const result = await orderCollection.insertOne(order); 
      //   return res.send({result, success: true}); 
      // }
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