As asked in the assignment i have completed all the functional requirements

1 -> per user expense ledger
2 -> maintained the idempotency to avoid double submission due to retries
3 -> used aws to host the whole application
4 -> containerized the backend and frontend separately
5 -> settled up the cicd pipeline for deployment using githib actions
6 -> applied rate limiting to avoid abuse

limitations: 

1 -> have used a single instance of ec2 for the deployment,  we should be doing it on the eks
2 -> I hosted the mysql on the instance itself due resource limitations, we should be doing it on the rds
3 -> didnt got the time to write the test cases