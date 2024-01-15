const express = require('express')
require('dotenv').config()
const app = express();
const cors = require('cors');
const { default: mongoose } = require('mongoose');
const User = require('./models/User');
const Place = require('./models/Place')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser');
const imageDownloader = require('image-downloader')
const multer = require('multer')
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3')
const fs = require('fs');
const Booking = require('./models/Booking');
const mime = require('mime-types'); 
const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = 'dadahwbdhawbhbwdhq12e3jrj3r8'
const bucket = 'amey-booking-app'

app.use(express.json())  //parse json
app.use(cookieParser())

app.use('/uploads', express.static(__dirname + '/uploads'))
app.use(cors({
    credentials: true,
    origin: process.env.PORT 
}));

// console.log(process.env.MONGO_URL)

async function uploadToS3(path, originalFilename, mimetype)
{
    const client = new S3Client({
        region: 'ap-south-1',
        credentials:{
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
    })
    const parts = originalFilename.split('.');
    const ext = parts[parts.length-1];
    const newFilename = Date.now() + '.' + ext;
    const data = await client.send(new PutObjectCommand({
        Bucket: bucket,
        Body: fs.readFileSync(path),
        Key: newFilename,
        ContentType: mimetype,
        ACL: 'public-read',
    }));
    return `https://${bucket}.s3.amazonaws.com/${newFilename}`
}



function getUserDataFromToken(req) {
    return new Promise((resolve, reject) => {
        jwt.verify(req.cookies.token, jwtSecret, {}, async (err, userData) => {
            if (err) throw err;
            resolve(userData) 
        })
    })
}



app.get('/api/test', (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    res.json('test ok')
})






//DpWuG5AaBB7k7R3o
app.post('/api/register', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const { name, email, password } = req.body;
    try {
        const userDoc = await User.create({
            name,
            email,
            password: bcrypt.hashSync(password, bcryptSalt),
        })
        res.json(userDoc)
    } catch (e) {
        res.status(422).json(e)
    }

})

app.post('/api/login', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const { email, password } = req.body
    const userDoc = await User.findOne({ email })
    if (userDoc) {
        // res.json("found")x
        const passok = bcrypt.compareSync(password, userDoc.password)
        if (passok) {
            jwt.sign({
                email: userDoc.email,
                id: userDoc._id,

            },
                jwtSecret, {}, (err, token) => {
                    if (err) throw err;
                    res.cookie('token', token).json(userDoc)
                })
        }
        else {
            res.status(422).json("password Wrong")
        }
    }
    else {
        res.json("Not Found")
    }
})

app.get('/api/profile', (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const { token } = req.cookies
    if (token) {
        jwt.verify(token, jwtSecret, {}, async(err, userData) => {
            if (err) throw err;
            const {name,email,_id} = User.findById(userData.id)
            res.json({name,email,_id})
        })
    }
    else {
        res.json(null)
    }

})

app.post('/api/logout', (req, res) => {
    res.cookie('token', '').json(true)
})

app.post('/api/upload-by-link', async (req, res) => {
    const { link } = req.body;
    const newName = 'photo' + Date.now() + '.jpg'
    await imageDownloader.image({
        url: link,
        dest: '/tmp/' + newName,
    });
    const url = await uploadToS3('/tmp/' + newName, newName,mime.lookup('/tmp/'+ newName))
    res.json(url)

})


const photosMiddleware = multer({ dest: '/tmp' })

app.post('/api/upload',photosMiddleware.array('photos', 100) ,async(req, res) => {
    const uploadedFiles = [];
    for (let i = 0; i < req.files.length; i++) {
        const { path, originalname, mimetype } = req.files[i];
        const url = await uploadToS3(path,originalname, mimetype);
        uploadedFiles.push(url);
    }
    res.json(uploadedFiles)
});


app.post('/api/places', (req, res) => {
    mongoose.connect(process.env.MONGO_URL)
    const { token } = req.cookies
    const { title, address, addedPhotos, description, perks, extraInfo, checkIn, checkOut, maxGuest, price } = req.body;
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
        if (err) throw err;
        const placeDoc = await Place.create({
            owner: userData.id,
            title, address, photos: addedPhotos, description, perks,
            extraInfo, checkIn, checkOut, maxGuest, price

        })
        res.json(placeDoc)
    })
})

app.get('/api/user-places', (req, res) => {
    mongoose.connect(process.env.MONGO_URL)
    const { token } = req.cookies
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
        const { id } = userData;
        res.json(await Place.find({ owner: id }))
    })
})

app.get('/api/places/:id', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL)
    const { id } = req.params;
    res.json(await Place.findById(id));
})

app.put('/api/places', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL)
    const { token } = req.cookies
    const { id, title, address, addedPhotos,
        description, perks, extraInfo,
        checkIn, checkOut, maxGuest, price } = req.body;
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
        const placeDoc = await Place.findById(id)
        if (userData.id === placeDoc.owner.toString()) {
            placeDoc.set({
                title, address, photos: addedPhotos, description, perks,
                extraInfo, checkIn, checkOut, maxGuest, price
            })
            placeDoc.save();
            res.json('ok')
        }
    })

})

app.get('/api/places', async (req, res) => {
    mongoose.connect(process.env.MONGO_URL)
    res.json(await Place.find())
})


app.post('/api/bookings', async(req, res) => {
    mongoose.connect(process.env.MONGO_URL)
    const userData = await getUserDataFromToken(req)
    const { place, checkIn, checkOut, numberofGuest, fullName, mobile, price } = req.body;
    Booking.create({
        place, checkIn, checkOut, numberofGuest, fullName, mobile, price,user:userData.id
    }).then((doc) => {
        res.json(doc)
    }).catch((err) => {
        throw err;
    })
})



app.get('/api/bookings',async (req, res) => {
    mongoose.connect(process.env.MONGO_URL);
    const userData =await getUserDataFromToken(req)
    // console.log(Booking.find({user:userData.id}))
    res.json( await  Booking.find({user:userData.id}).populate('place'))
})

app.listen(4000)
