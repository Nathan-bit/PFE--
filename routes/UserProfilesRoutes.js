const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const flash = require('connect-flash');
const bcrypt = require('bcrypt');
const user_registration  = require('../controllers/UserRegistration');
const router = express.Router();
const app=express();
app.use(express.urlencoded({extended : true}));
app.use(express.json());
app.use(bodyParser.json())
app.use(flash());
app.use((req, res, next) => {
  res.locals.messages = req.flash();
  next();
});

let data
router.get('/',async (req, res) => {
       if(req.session.user)
       {
          let user = req.session.user;
          let email = user.EMAIL;
          console.log(user)
          const userData = await user_registration.findOne({ where: {email } });
          if(userData)
          { 
            data=userData
       
            req.flash('success','Data was retrieve successfully')
            return res.render('UserSettingsProfiles', { userData , messages: req.flash() }); 
           
          }
          else {
            userData=null
            req.flash('error', 'An error occurred while retrieving user data. Please try again later. If the problem persists, log out and log in again! ');
            return res.render('UserSettingsProfiles', {userData, messages: req.flash() });
          }
          
       }   
        userData=null
        req.flash('error', 'An error occurred while retrieving user data. Please try again later. If the problem persists, log out and log in again! ');
        return res.render('UserSettingsProfiles', {userData, messages: req.flash() });
});


router.post('/updateUserData', async (req, res) => {
  const { EMAIL, ...otherFields } = req.body;
  const UUID = otherFields.UUID;

  try {
      const { PASSWORD, PASSWORD2, ...fieldsWithoutPasswords } = otherFields;

      if (PASSWORD && PASSWORD2) {
          if (PASSWORD !== PASSWORD2) {
              req.flash('error', 'Passwords do not match, please try again.');
              return res.render('UserSettingsProfiles', { userData: req.session.user, messages: req.flash() });
          }
          if (PASSWORD.length < 8 || PASSWORD2.length < 8) {
              req.flash('info', 'Password is too weak, it must be at least 8 characters long, please try again.');
              return res.render('UserSettingsProfiles', { userData: req.session.user, messages: req.flash() });
          }
      }

      delete fieldsWithoutPasswords.PASSWORD2;

      const saltRounds = 10;
      const salt = await bcrypt.genSalt(saltRounds);
      const hashedPassword = await bcrypt.hash(PASSWORD, salt);
      fieldsWithoutPasswords.PASSWORD = hashedPassword;

      const existingUser = await user_registration.findOne({ where: { EMAIL } });
      if (!existingUser) {
          req.flash('error', `User with email ( ${EMAIL}) not found.`);
          return res.render('UserSettingsProfiles', { userData: req.session.user, messages: req.flash() });
      }

      const existingUUID = await user_registration.findOne({ where: { UUID } });
      if (!existingUUID) {
          req.flash('error', `User with provided UUID ( ${UUID}) not found.`);
          return res.render('UserSettingsProfiles', { userData: req.session.user, messages: req.flash() });
      }

      await user_registration.update(fieldsWithoutPasswords, { where: { EMAIL } });

      const updatedUserData = await user_registration.findOne({ where: { EMAIL } });
      if (updatedUserData) {
          const userData = updatedUserData.toJSON();
          req.session.user = userData;
          req.flash('success', 'Profile updated successfully.');
          return res.render('UserSettingsProfiles', { userData, messages: req.flash() });
      }

      req.flash('error', `An error occurred while finding user ${EMAIL} data.`);
      return res.render('UserSettingsProfiles', { userData: req.session.user, messages: req.flash() });

  } catch (error) {
      console.error('Error occurred during update:', error);
      req.flash('error', `An error occurred during update: ${error.message}`);
      return res.render('UserSettingsProfiles', { userData: req.session.user, messages: req.flash() });
  }
});



module.exports = router;