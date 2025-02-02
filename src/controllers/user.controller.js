import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import ApiError from "../utils/ApiErrors.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "somthing went wrong while generating the referesh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  //  get user-details from frontend
  const { fullName, username, email, password } = req.body;
  // console.log("this is req.body: ", req.body);
  // console.log("this is req.files: ", req.files);

  //  validation (validate it) - not emplty
  if (
    [fullName, username, email, password].some((feild) => feild?.trim() === "")
  ) {
    throw new ApiError(400, "All feilds are required");
  }

  //  check if user already exists: username, email
  const existedUser = await User.findOne({ $or: [{ username }, { email }] });

  if (existedUser) {
    throw new ApiError(409, "User already existed or email already taken");
  }

  //  check for images & check for avatar (avatar is must)
  const avatarLocalPath = req.files?.avatar[0]?.path; // req.files is provided by multer not by mongoDB

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path; // req.files is provided by multer not by mongoDB
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "avatarLocalPath is must");
  }

  //  upload them to cloudinary, avatar
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "avatar is must");
  }

  //  create user object (based on the given data) & create entry in DB
  const user = await User.create({
    fullName,
    username: username.toLowerCase(),
    email,
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
  });

  //  remove password and refresh token feild from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  //  check for user creation
  if (!createdUser) {
    throw new ApiError(500, "somthing went wrong while connecting to db");
  }

  //  return res
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "user registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // get the data from "req.body"
  const { username, email, password } = req.body;

  // check the username or email
  // !! possible error may occur in future
  if (!username && !email && !password) {
    throw new ApiError(400, "username or email or password is required");
  }

  // find the user in DB
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "user doesnot exists");
  }

  // check the password
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "password is not correct");
  }

  // generate access-token and refresh-token
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  // remove sensitive fields
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // send cookies
  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "user LoggedIn successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  // to understand this logic, go to ("user.routes.js") and ("auth.middleware.js" >> "verifyJWT")
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { refreshToken: undefined },
    },
    { new: true }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "user LoggedOut successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshToken(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "accessToken refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  // get info from frontend
  const { oldPassword, newPassword } = req.body;

  // find the user in the DB. confused ? goto (verifyJWT)
  const user = await User.findById(req.user?._id);

  // check if the user's oldpassword is correct
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(401, "Invalid old password");
  }

  // set new password
  user.password = newPassword;

  // save new password in the DB
  await user.save({ validateBeforeSave: false });

  // return res
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password updated successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(401, "All feilds are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { fullName, email } },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path; // req.file is provided by multer not by mongoDB

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar local path is must");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar?.url) {
    throw new ApiError(400, "Error while uploading the avatar on cloudinary");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { avatar: avatar.url } },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path; // req.file is provided by multer not by mongoDB

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover Image Local Path is must");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage?.url) {
    throw new ApiError(
      400,
      "Error while uploading the coverImage on cloudinary"
    );
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { coverImage: coverImage.url } },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "coverImage updated successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }

  const channel = await User.aggregate([
    { $match: { username: username?.toLowerCase() } },

    // count subscribers through channel
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },

    // count subscribed channels through subscribers
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },

    // adding additional feilds
    {
      $addFields: {
        subscribersCount: {
          $size: "subscribers",
        },
        channelSubscribedToCount: {
          $size: "subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },

    // sending selective properties
    {
      $project: {
        fullName: 1,
        username: 1,
        email: 1,
        avatar: 1,
        coverImage: 1,
        subscribersCount: 1,
        subscribersCount: 1,
        channelSubscribedToCount: 1,
      },
    },
  ]);

  if (!channel?.length) {
    throw new ApiError(404, "channel doesnot exists");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, channel[0], "channel fetched successfully"));
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user?._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [{ $project: { fullName: 1, username: 1, avatar: 1 } }],
            },
          },
          // this pipeline is just for front-end ease
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].WatchHistory,
        "watchHistory fetched successfully"
      )
    );
});

export {
  changeCurrentPassword,
  getCurrentUser,
  getUserChannelProfile,
  getWatchHistory,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
};
