#!/bin/bash

if [ -z $1 ]; then
	echo "./dcu.sh [extra options]"
	exit 1
fi 

dcu -n https://ccadmin-zaja.oracleoutsourcing.com -k eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI3ZDE2ZjFiMC1kYWJiLTQ1ZDItYmYxMC1jM2E5M2RkOTI2ZGMiLCJpc3MiOiJhcHBsaWNhdGlvbkF1dGgiLCJleHAiOjE1NjMxMTM3NjgsImlhdCI6MTUzMTU3Nzc2OH0=.VkjXSd4gm4bS/wPJOiN7aGCh42w5zlq4gdkRRWPlWrI= -b . $*
